import mongoose from "mongoose";
const { Schema } = mongoose;
const ObjectId = Schema.ObjectId;
const chatSchema = new Schema({
  owner: String, // String is shorthand for {type: String}
  with: String,
});

export const Chats = mongoose.model('Chats', chatSchema);

const userSchema = new Schema({
  email: {
    type: String,
    unique: true
  }, // String is shorthand for {type: String}
  password: String,
  name: String,
  online: {
    type: Boolean,
    default: false
  }
});

export const Users = mongoose.model('Users', userSchema);

const messageSchema = new Schema({
  // chat_id: String, // String is shorthand for {type: String}
  sender: ObjectId,
  receiver: ObjectId,
  message: String,
  read: Boolean,
  date: Date
});

export const Messages = mongoose.model('Messages', messageSchema);