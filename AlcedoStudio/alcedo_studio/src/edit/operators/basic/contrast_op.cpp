//  Copyright 2025 Yurun Zi
//  SPDX-License-Identifier: GPL-3.0-only
//  Additional permission under GPLv3 section 7 applies; see the LICENSE file.

#include "edit/operators/basic/contrast_op.hpp"

#include <opencv2/core.hpp>

#include "edit/operators/color/conversion/Oklab_cvt.hpp"
#include "edit/operators/operator_factory.hpp"

namespace alcedo {
namespace {

inline float contrast_k_from_slider(int v) {
  float s = std::max(-99, std::min(100, v)) / 100.0f;
  s = s * fabsf(s);
  return 4.0f + 4.0f * s;
}

}  // namespace

ContrastOp::ContrastOp() : contrast_offset_(0.0f) { scale_ = contrast_k_from_slider(0); }

ContrastOp::ContrastOp(float contrast_offset) : contrast_offset_(contrast_offset) {
  scale_ = contrast_k_from_slider(static_cast<int>(contrast_offset_));
}

ContrastOp::ContrastOp(const nlohmann::json& params) { SetParams(params); }

void ContrastOp::Apply(std::shared_ptr<ImageBuffer> input) {
  cv::Mat& linear_image = input->GetCPUData();

  linear_image.forEach<cv::Vec3f>([this](cv::Vec3f& pixel, const int*) -> void {
    auto lab = OklabCvt::ACESRGB2Oklab(pixel);
    lab.l_    = (lab.l_ - 0.5f) * scale_ + 0.5f;
    pixel    = OklabCvt::Oklab2ACESRGB(lab);
  });
}

void ContrastOp::ApplyGPU(std::shared_ptr<ImageBuffer>) {
  // Handled by the fused pipeline (basic.cl: opencl_contrast_on_luma_acescc).
  // Use the pipeline for GPU rendering instead of calling this standalone.
}

auto ContrastOp::GetParams() const -> nlohmann::json {
  nlohmann::json o;
  o[GetScriptName()] = contrast_offset_;
  return o;
}

void ContrastOp::SetParams(const nlohmann::json& params) {
  if (params.contains(GetScriptName())) {
    contrast_offset_ = params[GetScriptName()];
  } else {
    contrast_offset_ = 0.0f;
  }
  scale_ = contrast_k_from_slider(static_cast<int>(contrast_offset_));
}

void ContrastOp::SetGlobalParams(OperatorParams& params) const {
  params.contrast_scale_ = scale_;
}

void ContrastOp::EnableGlobalParams(OperatorParams& params, bool enable) {
  params.contrast_enabled_ = enable;
}
};  // namespace alcedo
