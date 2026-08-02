//  Copyright 2025 Yurun Zi
//  SPDX-License-Identifier: GPL-3.0-only
//  Additional permission under GPLv3 section 7 applies; see the LICENSE file.

#include "edit/operators/cst/cst_op.hpp"

#include <OpenColorIO/OpenColorIO.h>
#include <OpenColorIO/OpenColorTransforms.h>
#include <OpenColorIO/OpenColorTypes.h>

#include <opencv2/core.hpp>
#include <opencv2/core/matx.hpp>
#include <opencv2/core/types.hpp>
#include <string>
#include <vector>

#include "edit/operators/operator_factory.hpp"
#include "edit/operators/utils/functions.hpp"
#include "image/image_buffer.hpp"
#include "json.hpp"
#include "type/size.hpp"
#include "utils/string/convert.hpp"

namespace alcedo {

OCIO_ACES_Transform_Op::OCIO_ACES_Transform_Op(const std::string& input, const std::string& output)
    : input_transform_(input), output_transform_(output) {}

OCIO_ACES_Transform_Op::OCIO_ACES_Transform_Op(const std::string& input, const std::string& output,
                                               const char* config_path)
    : input_transform_(input), output_transform_(output) {}

OCIO_ACES_Transform_Op::OCIO_ACES_Transform_Op(std::filesystem::path& lmt_path)
    : input_transform_("ACES - ACEScct"), output_transform_("ACES - ACEScct"), lmt_path_(lmt_path) {}

OCIO_ACES_Transform_Op::OCIO_ACES_Transform_Op(const nlohmann::json& params) {
  SetParams(params);
}

void OCIO_ACES_Transform_Op::Apply(std::shared_ptr<ImageBuffer>) {
  // This operator is a descriptor-only stage. The pipeline handles CST through
  // its own fused OpenCL/Metal/CUDA kernel path (see edit_pipeline_fused.cl
  // opencl_tows_op / opencl_output_op). SetGlobalParams() writes the transform
  // parameters that the GPU fused pipeline consumes. No standalone CPU pixel
  // processing is needed in the production render path.
}

auto OCIO_ACES_Transform_Op::ApplyLMT(ImageBuffer&) -> ImageBuffer {
  // LMT is handled by the pipeline's LUT upload path (see lmt_lut in fused
  // params). This standalone method is not used in production.
  return {};
}

void OCIO_ACES_Transform_Op::ApplyGPU(std::shared_ptr<ImageBuffer>) {
  // GPU processing is handled by the pipeline's fused output transform stage.
  // See opencl_output_op / CUDA OutputTransform_fwd.
}

auto OCIO_ACES_Transform_Op::GetParams() const -> nlohmann::json {
  nlohmann::json o;
  nlohmann::json inner;

  inner["src"]            = input_transform_;
  inner["dest"]           = output_transform_;
  inner["limit"]          = limit_;
  inner["normalize"]      = normalize_;
  inner["transform_type"] = static_cast<uint32_t>(transform_type_);

  if (lmt_path_.has_value()) {
    inner["lmt"] = lmt_path_->u8string();
  }
  o[script_name_] = inner;

  return o;
}

void OCIO_ACES_Transform_Op::SetCSTProcessors(const char*, const char*) {
  // Processor setup is handled by the pipeline's runtime. The fused kernel
  // path does not require OCIO processor objects; it uses its own ACES
  // reference implementation and LUT-based LMT application.
}

void OCIO_ACES_Transform_Op::SetDisplayProcessors(const char* output) {
  (void)output;
  // Display processor setup is handled by the pipeline's runtime. The ODT
  // stage uses a native ACES 2.0 / OpenDRT implementation instead of OCIO.
}

void OCIO_ACES_Transform_Op::SetParams(const nlohmann::json& params) {
  if (!params.contains(script_name_)) {
    // No CST parameters provided — keep default transform values.
    return;
  }
  const auto& inner = params[script_name_];
  if (!inner.is_object() || !inner.contains("src") || !inner.contains("dst")) {
    // Incomplete CST parameters — keep defaults rather than crashing.
    return;
  }
  input_transform_  = inner["src"].get<std::string>();
  output_transform_ = inner["dst"].get<std::string>();
  if (inner.contains("limit")) {
    limit_ = inner["limit"].get<bool>();
  }

  if (inner.contains("normalize")) {
    normalize_ = inner["normalize"].get<bool>();
  }

  if (inner.contains("transform_type")) {
    transform_type_ = static_cast<TransformType>(inner["transform_type"].get<uint32_t>());
  }
}

void OCIO_ACES_Transform_Op::SetGlobalParams(OperatorParams& params) const {
  switch (transform_type_) {
    case TransformType::To_WorkingSpace:
      params.to_ws_dirty_              = true;
      break;
    case TransformType::To_OutputSpace:
      params.to_output_dirty_         = true;
      break;
  }
}

void OCIO_ACES_Transform_Op::EnableGlobalParams(OperatorParams& params, bool enable) {
  switch (transform_type_) {
    case TransformType::To_WorkingSpace:
      params.to_ws_enabled_ = enable;
      break;
    case TransformType::To_OutputSpace:
      params.to_output_enabled_ = enable;
      break;
  }
}
};  // namespace alcedo
