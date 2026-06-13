import { SetMetadata } from '@nestjs/common';
import { Action } from './roles';

export const RBAC_ACTION_KEY = 'rbac:action';

export const RequireAction = (action: Action) => SetMetadata(RBAC_ACTION_KEY, action);
