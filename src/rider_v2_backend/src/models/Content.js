"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.Content = void 0;

const mongoose = require("mongoose");

const FaqItemSchema = new mongoose.Schema(
  {
    id: String,
    question: String,
    answer: String,
  },
  { _id: false }
);

const ContentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    locale: { type: String, default: "en" },
    title: { type: String, default: "" },
    items: [FaqItemSchema],
  },
  { timestamps: true }
);

ContentSchema.index({ key: 1, locale: 1 }, { unique: true });

const Content = mongoose.model("Content", ContentSchema);
exports.Content = Content;
