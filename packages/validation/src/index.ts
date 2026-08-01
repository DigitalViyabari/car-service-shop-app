import { z } from "zod";

export const idSchema = z.string().min(1).max(128);
export const branchContextSchema = z.object({ companyId: idSchema, branchId: idSchema });
export const emailSchema = z.email();
export const callableRequestSchema = z.object({ companyId: idSchema, branchId: idSchema }).strict();
