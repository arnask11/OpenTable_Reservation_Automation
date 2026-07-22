import { describe, it, expect } from 'vitest';
import { resolveRestaurant, listRestaurants } from '../src/config/restaurants.js';

describe('resolveRestaurant', () => {
  it('resolves Amber India by name', () => {
    expect(resolveRestaurant({ restaurantName: 'Amber India San Francisco' })).toEqual({
      rid: 24886,
      name: 'Amber India',
    });
  });

  it('accepts a real numeric rid', () => {
    expect(resolveRestaurant({ rid: 24886 })).toEqual({
      rid: 24886,
      name: 'Amber India',
    });
  });

  it('rejects bogus rid without a known name', () => {
    const result = resolveRestaurant({ rid: 1 });
    expect(result.error).toMatch(/Missing restaurant|Unknown restaurant|valid OpenTable rid/i);
  });

  it('lists configured restaurants', () => {
    expect(listRestaurants()).toContainEqual({ rid: 24886, name: 'Amber India' });
  });
});
