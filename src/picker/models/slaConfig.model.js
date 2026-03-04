/**
 * Picker SLA configuration – single-document settings for workforce operations.
 * Store in collection 'picker_sla_config'. Use this config instead of hardcoded SLA values
 * in attendance, picking, or shift logic.
 */
const mongoose = require('mongoose');

const slaConfigSchema = new mongoose.Schema(
  {
    /** Max minutes allowed to complete picking an order (SLA target). */
    pickingSLA_minutes: { type: Number, default: 15, min: 1, max: 120 },
    /** Minutes of inactivity before idle alert is triggered. */
    idleAlert_minutes: { type: Number, default: 10, min: 1, max: 60 },
    /** Minutes after shift start before punch-in is considered late. */
    lateTolerance_minutes: { type: Number, default: 5, min: 0, max: 60 },
    /** Grace period (minutes) beyond shift end before overtime is counted. */
    overtimeGrace_minutes: { type: Number, default: 15, min: 0, max: 60 },
  },
  { timestamps: true, collection: 'picker_sla_config' }
);

slaConfigSchema.statics.getConfig = async function () {
  let doc = await this.findOne().lean();
  if (!doc) {
    doc = await this.create({
      _id: new mongoose.Types.ObjectId(),
      pickingSLA_minutes: 15,
      idleAlert_minutes: 10,
      lateTolerance_minutes: 5,
      overtimeGrace_minutes: 15,
    });
    return doc.toObject ? doc.toObject() : doc;
  }
  return doc;
};

module.exports =
  mongoose.models.PickerSlaConfig ||
  mongoose.model('PickerSlaConfig', slaConfigSchema);
