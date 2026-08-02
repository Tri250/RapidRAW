//  Copyright 2025 Yurun Zi
//  SPDX-License-Identifier: GPL-3.0-only
//  Additional permission under GPLv3 section 7 applies; see the LICENSE file.

#include "edit/operators/wheel/color_wheel_op.hpp"

#include <algorithm>
#include <cmath>
#include <opencv2/core.hpp>
#include <opencv2/core/types.hpp>

#include "image/image_buffer.hpp"

namespace alcedo {
namespace {
constexpr float kSopEpsilon = 1e-6f;

auto ClampUnitDisc(cv::Point2f p) -> cv::Point2f {
  if (!std::isfinite(p.x) || !std::isfinite(p.y)) {
    return cv::Point2f(0.0f, 0.0f);
  }
  const float r = std::sqrt(p.x * p.x + p.y * p.y);
  if (r <= 1.0f || r <= kSopEpsilon) {
    return p;
  }
  const float inv_r = 1.0f / r;
  return cv::Point2f(p.x * inv_r, p.y * inv_r);
}

auto ParsePoint2(const nlohmann::json& obj, const char* key, cv::Point2f& out) -> bool {
  if (!obj.contains(key) || !obj.at(key).is_object()) {
    return false;
  }
  const auto& point = obj.at(key);
  if (!point.contains("x") || !point.contains("y")) {
    return false;
  }
  try {
    out = cv::Point2f(point.at("x").get<float>(), point.at("y").get<float>());
    return std::isfinite(out.x) && std::isfinite(out.y);
  } catch (...) {
    return false;
  }
}

auto ParsePoint3(const nlohmann::json& obj, const char* key, cv::Point3f& out) -> bool {
  if (!obj.contains(key) || !obj.at(key).is_object()) {
    return false;
  }
  const auto& point = obj.at(key);
  if (!point.contains("x") || !point.contains("y") || !point.contains("z")) {
    return false;
  }
  try {
    out = cv::Point3f(point.at("x").get<float>(), point.at("y").get<float>(),
                      point.at("z").get<float>());
    return std::isfinite(out.x) && std::isfinite(out.y) && std::isfinite(out.z);
  } catch (...) {
    return false;
  }
}

auto ParseFloat(const nlohmann::json& obj, const char* key, float& out) -> bool {
  if (!obj.contains(key)) {
    return false;
  }
  try {
    out = obj.at(key).get<float>();
    return std::isfinite(out);
  } catch (...) {
    return false;
  }
}

void ParseWheelControl(const nlohmann::json& root, const char* key, ColorWheelOp::WheelControl& wheel) {
  if (!root.contains(key) || !root.at(key).is_object()) {
    return;
  }
  const auto& src = root.at(key);

  cv::Point2f disc = wheel.disc_;
  if (ParsePoint2(src, "disc", disc)) {
    wheel.disc_ = ClampUnitDisc(disc);
  }

  float strength = wheel.strength_;
  if (ParseFloat(src, "strength", strength)) {
    wheel.strength_ = std::max(strength, 0.0f);
  }

  cv::Point3f color_offset = wheel.color_offset_;
  if (ParsePoint3(src, "color_offset", color_offset)) {
    wheel.color_offset_ = color_offset;
  }

  float luminance_offset = wheel.luminance_offset_;
  if (ParseFloat(src, "luminance_offset", luminance_offset)) {
    wheel.luminance_offset_ = luminance_offset;
  }
}

auto WheelControlToJson(const ColorWheelOp::WheelControl& wheel) -> nlohmann::json {
  return {
      {"disc", {{"x", wheel.disc_.x}, {"y", wheel.disc_.y}}},
      {"strength", wheel.strength_},
      {"color_offset",
       {{"x", wheel.color_offset_.x}, {"y", wheel.color_offset_.y}, {"z", wheel.color_offset_.z}}},
      {"luminance_offset", wheel.luminance_offset_}};
}
}  // namespace

ColorWheelOp::ColorWheelOp() {
  lift_.color_offset_  = cv::Point3f(0.0f, 0.0f, 0.0f);
  gamma_.color_offset_ = cv::Point3f(1.0f, 1.0f, 1.0f);
  gain_.color_offset_  = cv::Point3f(1.0f, 1.0f, 1.0f);
}

ColorWheelOp::ColorWheelOp(const nlohmann::json& params) : ColorWheelOp() { SetParams(params); }

void ColorWheelOp::Apply(std::shared_ptr<ImageBuffer> input) {
  cv::Mat& img = input->GetCPUData();
  if (img.empty()) {
    // No valid image data to process — return silently to avoid crashing the
    // render pipeline. The caller should detect the empty result downstream.
    return;
  }

  const cv::Vec3f offset(lift_.color_offset_.x + lift_.luminance_offset_,
                         lift_.color_offset_.y + lift_.luminance_offset_,
                         lift_.color_offset_.z + lift_.luminance_offset_);
  const cv::Vec3f slope_raw(gain_.color_offset_.x + gain_.luminance_offset_,
                            gain_.color_offset_.y + gain_.luminance_offset_,
                            gain_.color_offset_.z + gain_.luminance_offset_);
  const cv::Vec3f power_raw(gamma_.color_offset_.x + gamma_.luminance_offset_,
                            gamma_.color_offset_.y + gamma_.luminance_offset_,
                            gamma_.color_offset_.z + gamma_.luminance_offset_);

  const cv::Vec3f slope(std::max(slope_raw[0], kSopEpsilon), std::max(slope_raw[1], kSopEpsilon),
                        std::max(slope_raw[2], kSopEpsilon));
  const cv::Vec3f power(std::max(power_raw[0], kSopEpsilon), std::max(power_raw[1], kSopEpsilon),
                        std::max(power_raw[2], kSopEpsilon));

  img.forEach<cv::Vec3f>([&](cv::Vec3f& pixel, const int*) {
    for (int c = 0; c < 3; ++c) {
      const float base = std::max(pixel[c] * slope[c] + offset[c], 0.0f);
      pixel[c]         = std::clamp(std::pow(base, power[c]), 0.0f, 1.0f);
    }
  });
}

void ColorWheelOp::ApplyGPU(std::shared_ptr<ImageBuffer>) {
  // Handled by the fused pipeline (edit_pipeline_fused.cl: opencl_color_wheel_op).
  // Use the pipeline for GPU rendering instead of calling this standalone.
}

auto ColorWheelOp::GetParams() const -> nlohmann::json {
  nlohmann::json o;
  o[script_name_] = {{"lift", WheelControlToJson(lift_)},
                     {"gamma", WheelControlToJson(gamma_)},
                     {"gain", WheelControlToJson(gain_)}};
  return o;
}

void ColorWheelOp::SetParams(const nlohmann::json& params) {
  if (!params.contains(script_name_)) {
    return;
  }
  const auto& j = params.at(script_name_);
  if (j.contains("lift") && j.at("lift").is_object()) {
    ParseWheelControl(j, "lift", lift_);
  }
  if (j.contains("gamma") && j.at("gamma").is_object()) {
    ParseWheelControl(j, "gamma", gamma_);
  }
  if (j.contains("gain") && j.at("gain").is_object()) {
    ParseWheelControl(j, "gain", gain_);
  }
}

void ColorWheelOp::SetGlobalParams(OperatorParams& params) const {
  params.color_wheel_lift_   = lift_;
  params.color_wheel_gamma_  = gamma_;
  params.color_wheel_gain_   = gain_;
}

void ColorWheelOp::EnableGlobalParams(OperatorParams& params, bool enable) {
  params.color_wheel_enabled_ = enable;
}
}  // namespace alcedo
