import { describe, expect, it } from 'bun:test';
import { getDeviceTypeByWidth } from 'src/constants/responsive';

describe('responsive constants', () => {
  it('should map phone width correctly', () => {
    expect(getDeviceTypeByWidth(320)).toBe('phone');
    expect(getDeviceTypeByWidth(767)).toBe('phone');
  });

  it('should map tablet width correctly', () => {
    expect(getDeviceTypeByWidth(768)).toBe('tablet');
    expect(getDeviceTypeByWidth(1024)).toBe('tablet');
    expect(getDeviceTypeByWidth(1279)).toBe('tablet');
  });

  it('should map desktop width correctly', () => {
    expect(getDeviceTypeByWidth(1280)).toBe('desktop');
    expect(getDeviceTypeByWidth(1600)).toBe('desktop');
  });
});

