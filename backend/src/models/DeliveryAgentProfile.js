import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    vehicleType: { type: String, enum: ['bike', 'scooter', 'van', 'electric', 'other'], default: 'bike' },
    vehicleNumber: { type: String, trim: true },
    drivingLicense: { type: String, trim: true },
    servicePincodes: [{ type: String, trim: true }],
    currentLocation: {
      city: String,
      pincode: String,
      updatedAt: Date,
    },
    isAvailable: { type: Boolean, default: true },
    completedDeliveries: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    ratingCount: { type: Number, default: 0 },
    earningsPaise: { type: Number, default: 0 },
    incentivesPaise: { type: Number, default: 0 },
  },
  { timestamps: true },
);

schema.index({ servicePincodes: 1 });
schema.index({ isAvailable: 1 });

export default mongoose.model('DeliveryAgentProfile', schema);
