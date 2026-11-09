import mongoose from 'mongoose';

async function main() {
  console.log('Connecting to mongodb on port 27018...');
  const conn = await mongoose.connect('mongodb://127.0.0.1:27018/admin?directConnection=true');
  const admin = conn.connection.db.admin();
  try {
    const status = await admin.command({ replSetGetStatus: 1 });
    console.log('Replica set already initialized:', status.set);
  } catch (err) {
    if (err.codeName === 'NotYetInitialized' || err.message.includes('no replset config has been received')) {
      console.log('Initiating replica set rs0...');
      await admin.command({
        replSetInitiate: {
          _id: 'rs0',
          members: [{ _id: 0, host: '127.0.0.1:27018' }],
        },
      });
      console.log('Replica set rs0 initialized successfully!');
    } else {
      console.error('ReplSet error:', err);
    }
  }
  await mongoose.disconnect();
}

main().catch(console.error);
