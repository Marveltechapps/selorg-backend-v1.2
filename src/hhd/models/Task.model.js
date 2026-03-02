const mongoose = require('mongoose');
const { TASK_STATUS, TASK_PRIORITY } = require('../utils/constants');

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Please add a task title'] },
    description: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'HHDUser', required: true, index: true },
    orderId: { type: String },
    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.PENDING,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(TASK_PRIORITY),
      default: TASK_PRIORITY.MEDIUM,
    },
    dueDate: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true, collection: 'hhd_tasks' }
);

TaskSchema.index({ userId: 1, status: 1 });
TaskSchema.index({ status: 1, priority: 1 });

module.exports = mongoose.model('HHDTask', TaskSchema);
