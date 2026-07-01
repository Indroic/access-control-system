import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	userAc,
} from "better-auth/plugins/admin/access";

export const statement = {
	...defaultStatements,
} as const;

export const ac = createAccessControl(statement);

export const admin = ac.newRole({
	...adminAc.statements,
});

export const user = ac.newRole({
	...userAc.statements,
});

export const jefe = ac.newRole({
	...userAc.statements,
});

export const gerente = ac.newRole({
	...userAc.statements,
});
