import {
  type ColDef,
  type GridOptions,
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

export const gridTheme = themeQuartz.withParams({
  borderRadius: 6,
  headerFontWeight: 500,
  spacing: 6,
})

export const defaultColDef: ColDef = {
  resizable: true,
  sortable: true,
  filter: true,
  minWidth: 80,
  floatingFilter: true,
}

export const defaultGridOptions: GridOptions = {
  animateRows: false,
  domLayout: 'autoHeight',
  suppressCellFocus: true,
  enableCellTextSelection: true,
}
