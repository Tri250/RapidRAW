//  Copyright 2025 Yurun Zi
//  SPDX-License-Identifier: GPL-3.0-only
//  Additional permission under GPLv3 section 7 applies; see the LICENSE file.

#include "edit/operators/basic/exposure_op.hpp"

#include <opencv2/core.hpp>
#include <opencv2/core/mat.hpp>
#include <opencv2/core/types.hpp>

#include "edit/operators/op_kernel.hpp"
#include "image/image_buffer.hpp"


namespace alcedo {

ExposureOp::ExposureOp() : exposure_offset_(0.0f) { scale_ = 0.0f; }

ExposureOp::ExposureOp(float exposure_offset) : exposure_offset_(exposure_offset) {
  scale_ = exposure_offset_ / 17.52f;
}

ExposureOp::ExposureOp(const nlohmann::json& params) { SetParams(params); }

void ExposureOp::Apply(std::shared_ptr<ImageBuffer> input) {
  cv::Mat& img = input->GetCPUData();

  img.forEach<cv::Vec3f>([&](cv::Vec3f& pixel, const int*) {
    pixel[0] += scale_;
    pixel[1] += scale_;
    pixel[2] += scale_;
  });
}

void ExposureOp::ApplyGPU(std::shared_ptr<ImageBuffer>) {
  // Handled by the fused pipeline (basic.cl: px.xyz += exposure_offset_).
  // Use the pipeline for GPU rendering instead of calling this standalone.
}

auto ExposureOp::GetParams() const -> nlohmann::json {
  nlohmann::json o;
  o[GetScriptName()] = exposure_offset_;

  return o;
}

void ExposureOp::SetParams(const nlohmann::json& params) {
  if (!params.contains(GetScriptName())) {
    exposure_offset_ = 0.0f;
  } else {
    exposure_offset_ = params[GetScriptName()];
  }
  scale_           = exposure_offset_ / 17.52f;
}

void ExposureOp::SetGlobalParams(OperatorParams& params) const {
  params.exposure_offset_ = scale_;
}

void ExposureOp::EnableGlobalParams(OperatorParams& params, bool enable) {
  params.exposure_enabled_ = enable;
}

};  // namespace alcedo
