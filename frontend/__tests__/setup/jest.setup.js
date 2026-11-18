// Jest only: in-memory AsyncStorage (no native module in Node).
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
