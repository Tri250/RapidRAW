//  Copyright 2025 Yurun Zi
//  SPDX-License-Identifier: GPL-3.0-only
//  Additional permission under GPLv3 section 7 applies; see the LICENSE file.

#include "edit/operators/cst/lmt_op.hpp"

namespace alcedo {
namespace {

auto PathToUtf8(const std::filesystem::path& path) -> std::string {
  const auto utf8 = path.generic_u8string();
  return {reinterpret_cast<const char*>(utf8.data()), utf8.size()};
}

auto Utf8OrNativeToPath(const std::string& raw_path) -> std::filesystem::path {
  if (raw_path.empty()) {
    return {};
  }
  try {
    const auto* begin = reinterpret_cast<const char8_t*>(raw_path.data());
    return std::filesystem::path(std::u8string(begin, begin + raw_path.size()));
  } catch (...) {
    return std::filesystem::path(raw_path);
  }
}

}  // namespace

OCIO_LMT_Transform_Op::OCIO_LMT_Transform_Op(std::filesystem::path& lmt_path)
    : lmt_path_(lmt_path) {}

OCIO_LMT_Transform_Op::OCIO_LMT_Transform_Op(const nlohmann::json& params) {
  SetParams(params);
}

void OCIO_LMT_Transform_Op::Apply(std::shared_ptr<ImageBuffer>) {
  // This operator is a descriptor-only stage. The pipeline handles LMT through
  // its own LUT upload path (see lmt_lut in fused params and opencl_lmt_op).
  // SetGlobalParams() writes the LMT path that the pipeline loads as a 3D LUT.
}

void OCIO_LMT_Transform_Op::ApplyGPU(std::shared_ptr<ImageBuffer>) {
  // GPU processing is handled by the pipeline's fused LMT stage.
  // See opencl_lmt_op / lmt_lut texture upload.
}

auto OCIO_LMT_Transform_Op::GetParams() const -> nlohmann::json {
  nlohmann::json o;
  o[script_name_] = PathToUtf8(lmt_path_);

  return o;
}

void OCIO_LMT_Transform_Op::SetParams(const nlohmann::json& params) {
  if (!params.contains(script_name_)) {
    lmt_path_ = std::filesystem::path();
    return;
  }
  const std::string raw_path = params[script_name_].get<std::string>();
  if (raw_path.empty()) {
    lmt_path_ = std::filesystem::path();
    return;
  }
  lmt_path_ = Utf8OrNativeToPath(raw_path);
}

void OCIO_LMT_Transform_Op::SetGlobalParams(OperatorParams& params) const {
  params.lmt_lut_path_  = lmt_path_;
  params.lmt_enabled_   = !lmt_path_.empty();
  // Only mark dirty when enabled; otherwise GPU upload would attempt to parse an empty path.
  params.to_lmt_dirty_  = params.lmt_enabled_;
}

void OCIO_LMT_Transform_Op::EnableGlobalParams(OperatorParams& params, bool enable) {
  params.lmt_enabled_  = enable;
  params.to_lmt_dirty_ = enable;
}
};  // namespace alcedo
