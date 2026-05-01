import {
  clampAvatarCropTransform,
  getAvatarCropSelection,
} from '@/utils/avatarCrop';

describe('avatarCrop', () => {
  it('starts with a centered square crop for a 16:9 source', () => {
    expect(
      getAvatarCropSelection({
        width: 1600,
        height: 900,
        cropSize: 300,
        scale: 1,
        translateX: 0,
        translateY: 0,
      }),
    ).toEqual({
      originX: 350,
      originY: 0,
      width: 900,
      height: 900,
    });
  });

  it('starts with a centered square crop for a 9:16 source', () => {
    expect(
      getAvatarCropSelection({
        width: 900,
        height: 1600,
        cropSize: 300,
        scale: 1,
        translateX: 0,
        translateY: 0,
      }),
    ).toEqual({
      originX: 0,
      originY: 350,
      width: 900,
      height: 900,
    });
  });

  it('keeps a square source unchanged at the initial crop', () => {
    expect(
      getAvatarCropSelection({
        width: 1200,
        height: 1200,
        cropSize: 300,
        scale: 1,
        translateX: 0,
        translateY: 0,
      }),
    ).toEqual({
      originX: 0,
      originY: 0,
      width: 1200,
      height: 1200,
    });
  });

  it('clamps zoom and translation so the crop never leaves the image', () => {
    const transform = clampAvatarCropTransform({
      width: 1600,
      height: 900,
      cropSize: 300,
      scale: 9,
      translateX: 9999,
      translateY: -9999,
    });

    expect(transform.scale).toBe(4);
    expect(transform.translateX).toBeCloseTo(916.6667);
    expect(transform.translateY).toBe(-450);

    expect(
      getAvatarCropSelection({
        width: 1600,
        height: 900,
        cropSize: 300,
        ...transform,
      }),
    ).toEqual({
      originX: 0,
      originY: 675,
      width: 225,
      height: 225,
    });
  });
});
