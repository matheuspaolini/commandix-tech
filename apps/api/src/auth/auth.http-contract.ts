/** HTTP presentation contract consumed by other API feature modules. */
export {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from "@/auth/presentation/access-token.guard";
export { Roles, RolesGuard } from "@/auth/presentation/roles";
export { CredentialsDto } from "@/auth/presentation/dto";
