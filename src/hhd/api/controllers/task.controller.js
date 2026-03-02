const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDTask = require('../../models/Task.model');
const { TASK_STATUS } = require('../../utils/constants');

async function getTasks(req, res, next) {
  try {
    const userId = req.user?.id;
    const { status, priority, page = 1, limit = 10 } = req.query;
    const query = { userId };
    if (status) query.status = status;
    if (priority) query.priority = priority;
    const skip = (Number(page) - 1) * Number(limit);
    const tasks = await HHDTask.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await HHDTask.countDocuments(query);
    res.status(200).json({
      success: true,
      count: tasks.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
}

async function createTask(req, res, next) {
  try {
    const userId = req.user?.id;
    const { title, description, orderId, priority, dueDate } = req.body;
    const task = await HHDTask.create({ title, description, userId, orderId, priority, dueDate });
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
}

async function updateTask(req, res, next) {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id;
    const { title, description, status, priority, dueDate } = req.body;
    const task = await HHDTask.findOne({ _id: taskId, userId });
    if (!task) throw new ErrorResponse(`Task not found with id of ${taskId}`, 404);
    if (title) task.title = title;
    if (description) task.description = description;
    if (status) {
      task.status = status;
      if (status === TASK_STATUS.COMPLETED) task.completedAt = new Date();
    }
    if (priority) task.priority = priority;
    if (dueDate) task.dueDate = dueDate;
    await task.save();
    res.status(200).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
}

async function deleteTask(req, res, next) {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id;
    const task = await HHDTask.findOne({ _id: taskId, userId });
    if (!task) throw new ErrorResponse(`Task not found with id of ${taskId}`, 404);
    await task.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
}

module.exports = { getTasks, createTask, updateTask, deleteTask };
