export const CATEGORIES = [
  "Rent / Housing",
  "Utilities",
  "Medical",
  "Childcare",
  "Transportation",
  "Phone / Internet",
  "Education",
  "Groceries",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type User = {
  id: string;
  email: string;
  createdAt: string;
};

export type BillStatus = "open" | "paid";

export type Bill = {
  id: string;
  ownerId: string;
  category: Category;
  amountCents: number;
  dueDate: string; // YYYY-MM-DD
  status: BillStatus;
  // Private verification document. Never shown in the swipe portal.
  documentId: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type Contribution = {
  id: string;
  billId: string;
  userId: string;
  amountCents: number;
  // Reference from the payment provider. "sim_" prefix means simulated.
  paymentRef: string;
  createdAt: string;
};

export type Pass = {
  userId: string;
  billId: string;
  createdAt: string;
};

// What a swiper is allowed to see about a bill: numbers and a category only.
// No names, photos, stories, or location, so every bill is judged the same way.
export type BillCard = {
  id: string;
  category: Category;
  amountCents: number;
  remainingCents: number;
  dueDate: string;
  contributorCount: number;
};
