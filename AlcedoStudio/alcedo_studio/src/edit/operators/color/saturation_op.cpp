//  Copyright 2025 Yurun Zi
//  SPDX-License-Identifier: GPL-3.0-only
//  Additional permission under GPLv3 section 7 applies; see the LICENSE file.

#include "edit/operators/color/saturation_op.hpp"

#include <algorithm>

#include "edit/operators/color/conversion/Oklab_cvt.hpp"
#include "edit/operators/op_kernel.hpp"
#include "edit/operators/operator_factory.hpp"
#include "json.hpp"

namespace alcedo {

SaturationOp::SaturationOp() : saturation_offset_(0) { ComputeScale(); }

SaturationOp::SaturationOp(float saturation_offset) : saturation_offset_(saturation_offset) {
  ComputeScale();
}

SaturationOp::SaturationOp(const nlohmann::json& params) { SetParams(params); }

void SaturationOp::ComputeScale() {
  scale_ = std::max(0.0f, 1.0f + saturation_offset_ / 100.0f);
}

void SaturationOp::Apply(std::shared_ptr<ImageBuffer> input) {
  // CPU fallback: adjust saturation in OKLab color space, matching the fused
  // pipeline's opencl_saturation_op behavior.
  cv::Mat& img = input->GetCPUData();
  img.forEach<cv::Vec3f>([this](cv::Vec3f& pixel, const int*) {
    auto lab = OklabCvt::ACESRGB2Oklab(pixel);
    lab.a_ *= scale_;
    lab.b_ *= scale_;
    pixel = OklabCvt::Oklab2ACESRGB(lab);
  });
}

void SaturationOp::ApplyGPU(std::shared_ptr<ImageBuffer>) {
  // Handled by the fused pipeline (color.cl: saturation_offset_ multiplier).
  // Use the pipeline for GPU rendering instead of calling this standalone.
}

auto SaturationOp::GetParams() const -> nlohmann::json {
  nlohmann::json o;
  o[script_name_] = saturation_offset_;

  return o;
}

void SaturationOp::SetParams(const nlohmann::json& params) {
  if (params.contains(script_name_)) {
    saturation_offset_ = params[script_name_];
  } else {
    saturation_offset_ = 0.0f;
  }
  ComputeScale();
}

void SaturationOp::SetGlobalParams(OperatorParams& params) const {
  params.saturation_offset_ = scale_;
}

void SaturationOp::EnableGlobalParams(OperatorParams& params, bool enable) {
  params.saturation_enabled_ = enable;
}
};  // namespace alcedo
