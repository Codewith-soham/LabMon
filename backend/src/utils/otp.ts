import bcrypt from "bcrypt";
import crypto from "node:crypto";

const OTP_LENGTH = 6;

const generateOtp = (): string => {
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
};

const hashOtp = async (otp: string): Promise<string> => bcrypt.hash(otp, 10);

const compareOtp = async (otp: string, hash: string): Promise<boolean> => bcrypt.compare(otp, hash);

export { generateOtp, hashOtp, compareOtp };
