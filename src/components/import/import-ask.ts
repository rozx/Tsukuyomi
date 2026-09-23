/** 月詠提问中单题的界面作答状态：选中候选时记录序号，自由输入时只有文本。 */
export interface ImportAskValue {
  text: string;
  selectedIndex?: number;
}
