import { isEmail } from "class-validator";

export type Role = "ADMIN" | "MEMBER";

export type IdentityInput = {
  slug: string;
  email: string;
  password: string;
};

export class InvalidIdentityInput extends Error {}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function canonicalIdentity(input: IdentityInput): IdentityInput {
  if (
    typeof input.slug !== "string" ||
    typeof input.email !== "string" ||
    typeof input.password !== "string"
  ) {
    throw new InvalidIdentityInput();
  }
  const slug = input.slug.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const passwordLength = Array.from(input.password).length;
  if (
    slug.length < 3 ||
    slug.length > 63 ||
    !SLUG.test(slug) ||
    email.length > 254 ||
    !isEmail(email) ||
    passwordLength < 12 ||
    passwordLength > 128 ||
    !/\S/u.test(input.password)
  ) {
    throw new InvalidIdentityInput();
  }
  return { slug, email, password: input.password };
}
