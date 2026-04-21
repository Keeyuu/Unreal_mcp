import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeAutomationRequestMock } = vi.hoisted(() => ({
  executeAutomationRequestMock: vi.fn(async (): Promise<Record<string, unknown>> => ({
    success: true,
    widgetInfo: { tree: { name: 'Root', class: 'UCanvasPanel', children: [] } }
  }))
}));

vi.mock('./common-handlers.js', () => ({
  executeAutomationRequest: executeAutomationRequestMock,
  requireNonEmptyString: (value: unknown, fieldName: string) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Missing required parameter: ${fieldName}`);
    }
  }
}));

import { handleWidgetAuthoringTools } from './widget-authoring-handlers.js';

describe('widget_authoring get_widget_info tree response', () => {
  beforeEach(() => executeAutomationRequestMock.mockClear());

  it('passes through tree field in widgetInfo', async () => {
    const result = await handleWidgetAuthoringTools(
      'get_widget_info',
      { action: 'get_widget_info', widgetPath: '/Game/UI/WBP_Foo' },
      {} as never
    ) as { widgetInfo?: { tree?: unknown } };

    expect(result.widgetInfo?.tree).toMatchObject({
      name: expect.any(String),
      class: expect.any(String),
      children: expect.any(Array)
    });
  });
});

describe('widget-authoring: add_widget', () => {
  beforeEach(() => executeAutomationRequestMock.mockClear());

  it('forwards blueprint + parent + class + name + slotProps to the bridge', async () => {
    executeAutomationRequestMock.mockResolvedValueOnce({ success: true, widgetName: 'ChildInstance' });
    const res = await handleWidgetAuthoringTools(
      'add_widget',
      {
        widgetBlueprintPath: '/Game/UI/WBP_Parent',
        parentWidgetName: 'RootCanvas',
        widgetClass: '/Game/UI/WBP_HealthBar.WBP_HealthBar_C',
        widgetName: 'ChildInstance',
        slotProps: { Anchors: { Minimum: [0, 0] } }
      },
      {} as never
    ) as Record<string, unknown>;

    expect(res.success).toBe(true);
    expect(res.widgetName).toBe('ChildInstance');
    const callArgs = executeAutomationRequestMock.mock.calls[0] as unknown[];
    const payload = callArgs[2] as Record<string, unknown>;
    expect(payload.subAction).toBe('add_widget');
    expect(payload.widgetBlueprintPath).toBe('/Game/UI/WBP_Parent');
    expect(payload.parentWidgetName).toBe('RootCanvas');
    expect(payload.widgetClass).toBe('/Game/UI/WBP_HealthBar.WBP_HealthBar_C');
    expect(payload.widgetName).toBe('ChildInstance');
    expect(payload.slotProps).toEqual({ Anchors: { Minimum: [0, 0] } });
  });

  it('throws when required fields are missing', async () => {
    await expect(handleWidgetAuthoringTools(
      'add_widget',
      { widgetBlueprintPath: '/Game/UI/WBP_Parent' },
      {} as never
    )).rejects.toThrow(/parentWidgetName/);
  });
});

describe('widget-authoring: remove_widget', () => {
  beforeEach(() => executeAutomationRequestMock.mockClear());

  it('forwards path + widgetName to the bridge', async () => {
    executeAutomationRequestMock.mockResolvedValueOnce({ success: true });
    const res = await handleWidgetAuthoringTools(
      'remove_widget',
      { widgetBlueprintPath: '/Game/UI/WBP_Parent', widgetName: 'ChildInstance' },
      {} as never
    ) as Record<string, unknown>;

    expect(res.success).toBe(true);
    const callArgs = executeAutomationRequestMock.mock.calls[0] as unknown[];
    const payload = callArgs[2] as Record<string, unknown>;
    expect(payload.subAction).toBe('remove_widget');
    expect(payload.widgetBlueprintPath).toBe('/Game/UI/WBP_Parent');
    expect(payload.widgetName).toBe('ChildInstance');
  });

  it('throws when widgetName is missing', async () => {
    await expect(handleWidgetAuthoringTools(
      'remove_widget',
      { widgetBlueprintPath: '/Game/UI/WBP_Parent' },
      {} as never
    )).rejects.toThrow(/widgetName/);
  });
});

describe('widget-authoring: slotName normalization', () => {
  beforeEach(() => executeAutomationRequestMock.mockClear());

  const getPayload = () => {
    const callArgs = executeAutomationRequestMock.mock.calls[0] as unknown[];
    return callArgs[2] as Record<string, unknown>;
  };

  it('add_image: maps `name` into slotName (C++ reads slotName only)', async () => {
    await handleWidgetAuthoringTools(
      'add_image',
      { widgetPath: '/Game/UI/WBP_HUD', name: 'ImgBG' },
      {} as never
    );
    expect(getPayload().slotName).toBe('ImgBG');
  });

  it('add_image: maps `widgetName` into slotName', async () => {
    await handleWidgetAuthoringTools(
      'add_image',
      { widgetPath: '/Game/UI/WBP_HUD', widgetName: 'ImgBG' },
      {} as never
    );
    expect(getPayload().slotName).toBe('ImgBG');
  });

  it('add_image: explicit slotName wins over widgetName and name', async () => {
    await handleWidgetAuthoringTools(
      'add_image',
      {
        widgetPath: '/Game/UI/WBP_HUD',
        slotName: 'FromSlot',
        widgetName: 'FromWidgetName',
        name: 'FromName'
      },
      {} as never
    );
    expect(getPayload().slotName).toBe('FromSlot');
  });

  it('add_image: warns to stderr when multiple name fields have different values', async () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await handleWidgetAuthoringTools(
        'add_image',
        {
          widgetPath: '/Game/UI/WBP_HUD',
          slotName: 'FromSlot',
          name: 'FromName'
        },
        {} as never
      );
      const calls = writeSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(msg =>
        msg.includes('add_image') && msg.includes('slotName') && msg.includes('name')
      )).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('add_image: no warning when only one name field is provided', async () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await handleWidgetAuthoringTools(
        'add_image',
        { widgetPath: '/Game/UI/WBP_HUD', name: 'ImgBG' },
        {} as never
      );
      const calls = writeSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(msg => msg.includes('manage_widget_authoring'))).toBe(false);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('set_anchor: requireNonEmptyString(slotName) passes after normalization from name', async () => {
    const res = await handleWidgetAuthoringTools(
      'set_anchor',
      { widgetPath: '/Game/UI/WBP_HUD', name: 'ImgBG' },
      {} as never
    );
    expect((res as { success?: unknown }).success).toBe(true);
    expect(getPayload().slotName).toBe('ImgBG');
  });

  it('create_widget_blueprint: `name` is NOT normalized into slotName (preserves asset-name semantics)', async () => {
    await handleWidgetAuthoringTools(
      'create_widget_blueprint',
      { name: 'WBP_Foo', folder: '/Game/UI' },
      {} as never
    );
    const payload = getPayload();
    expect(payload.name).toBe('WBP_Foo');
    expect(payload.slotName).toBeUndefined();
  });

  it('add_widget: `widgetName` is preserved and NOT copied into slotName (C++ reads widgetName)', async () => {
    await handleWidgetAuthoringTools(
      'add_widget',
      {
        widgetBlueprintPath: '/Game/UI/WBP_Parent',
        parentWidgetName: 'RootCanvas',
        widgetClass: '/Game/UI/WBP_HealthBar.WBP_HealthBar_C',
        widgetName: 'ChildInstance'
      },
      {} as never
    );
    const payload = getPayload();
    expect(payload.widgetName).toBe('ChildInstance');
    expect(payload.slotName).toBeUndefined();
  });

  it('remove_widget: `widgetName` is preserved and NOT copied into slotName', async () => {
    await handleWidgetAuthoringTools(
      'remove_widget',
      { widgetBlueprintPath: '/Game/UI/WBP_Parent', widgetName: 'ChildInstance' },
      {} as never
    );
    const payload = getPayload();
    expect(payload.widgetName).toBe('ChildInstance');
    expect(payload.slotName).toBeUndefined();
  });
});
