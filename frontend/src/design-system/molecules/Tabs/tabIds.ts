/** Ids that link each tab to its panel (aria-controls / aria-labelledby). */
export const getTabId = (idPrefix: string, id: string) => `${idPrefix}-tab-${id}`
export const getTabPanelId = (idPrefix: string, id: string) => `${idPrefix}-panel-${id}`
