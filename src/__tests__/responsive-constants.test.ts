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
    expect(getDeviceTypeByWidth(1280)).toBe('tablet');
    // iPad Pro 12.9" 横屏上限
    expect(getDeviceTypeByWidth(1366)).toBe('tablet');
  });

  it('should map desktop width correctly', () => {
    expect(getDeviceTypeByWidth(1367)).toBe('desktop');
    expect(getDeviceTypeByWidth(1440)).toBe('desktop');
    expect(getDeviceTypeByWidth(1600)).toBe('desktop');
  });
});

