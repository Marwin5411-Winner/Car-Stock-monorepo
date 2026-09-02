import { describe, expect, it } from 'bun:test';
import { AppError } from '../lib/errors';
import {
  cannotDeleteVehicleModelError,
  isVehicleModelDeleteFkError,
  vehicleModelDeleteBlocked,
} from '../modules/vehicles/vehicles.service';

describe('vehicleModelDeleteBlocked', () => {
  it('allows delete when there is no live stock and no sales', () => {
    expect(vehicleModelDeleteBlocked(0, 0)).toBe(false);
  });

  it('blocks when live stock remains', () => {
    expect(vehicleModelDeleteBlocked(1, 0)).toBe(true);
  });

  it('blocks when a sale still references the model', () => {
    expect(vehicleModelDeleteBlocked(0, 2)).toBe(true);
  });
});

describe('cannotDeleteVehicleModelError', () => {
  it('uses the frontend-mapped 400 code instead of INTERNAL_ERROR', () => {
    const err = cannotDeleteVehicleModelError();
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe('CANNOT_DELETE_VEHICLE_WITH_STOCK');
  });
});

describe('isVehicleModelDeleteFkError', () => {
  it('treats Prisma P2003 / P2014 as a blocked delete', () => {
    const p2003 = Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' });
    const p2014 = Object.assign(new Error('Required relation would be violated'), {
      code: 'P2014',
    });
    expect(isVehicleModelDeleteFkError(p2003)).toBe(true);
    expect(isVehicleModelDeleteFkError(p2014)).toBe(true);
  });

  it('treats a raw restrict message as a blocked delete', () => {
    expect(
      isVehicleModelDeleteFkError(
        new Error('update or delete on table "vehicle_models" violates foreign key constraint')
      )
    ).toBe(true);
  });

  it('does not swallow unrelated errors', () => {
    expect(isVehicleModelDeleteFkError(new Error('connection refused'))).toBe(false);
    expect(isVehicleModelDeleteFkError({ code: 'P2002' })).toBe(false);
  });
});
