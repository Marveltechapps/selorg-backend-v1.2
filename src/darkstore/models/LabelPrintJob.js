const mongoose = require('mongoose');

const labelPrintJobSchema = new mongoose.Schema(
  {
    label_id: {
      type: String,
      required: true,
      unique: true,
    },
    print_job_id: {
      type: String,
      required: true,
      unique: true,
    },
    search_term: {
      type: String,
      required: true,
    },
    label_type: {
      type: String,
      required: true,
      enum: ['item_barcode', 'shelf_edge_label', 'bin_location_tag', 'pallet_id'],
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    printer_id: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      required: true,
      enum: ['queued', 'printing', 'completed', 'failed'],
      default: 'queued',
    },
    store_id: {
      type: String,
      required: true,
    },
    created_at: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: false,
  }
);

labelPrintJobSchema.index({ label_id: 1 });
labelPrintJobSchema.index({ print_job_id: 1 });
labelPrintJobSchema.index({ store_id: 1, status: 1 });

module.exports = mongoose.models.LabelPrintJob || mongoose.model('LabelPrintJob', labelPrintJobSchema);

