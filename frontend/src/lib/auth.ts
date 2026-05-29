import { login } from "./api";

export const demoActors = [
  {
    role: "MANUFACTURER",
    label: "Manufacturer",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  },
  {
    role: "IMPORTER",
    label: "Importer",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  },
  {
    role: "DISTRIBUTOR",
    label: "Distributor",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  },
  {
    role: "CLINIC",
    label: "Clinic",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  },
  {
    role: "PHARMACY",
    label: "Pharmacy",
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  },
];

export type DemoUser = {
  id: string;
  address: string;
  role: string;
  roles?: string[];
};

export function getStoredUser(): DemoUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("demoUser");
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token: string, user: DemoUser) {
  window.localStorage.setItem("demoToken", token);
  window.localStorage.setItem("demoUser", JSON.stringify(user));
}

export function clearSession() {
  window.localStorage.removeItem("demoToken");
  window.localStorage.removeItem("demoUser");
}

export async function loginDemo(actor: { address: string; role: string }) {
  const { token, user } = await login(actor);
  setSession(token, user);
  return user as DemoUser;
}
