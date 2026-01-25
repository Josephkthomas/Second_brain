import { SimulationNodeDatum, SimulationLinkDatum } from 'd3';

export interface TableRow {
  [key: string]: any;
}

export interface TableInfo {
  name: string;
  rowCount?: number;
}

export interface AiInsight {
  title: string;
  description: string;
  type: 'info' | 'warning' | 'success';
}

export interface AnalysisResult {
  summary: string;
  insights: AiInsight[];
}

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: string;
  val?: number; // Degree/Importance score
  data: TableRow; // Original row data
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  // New specific fields for graph logic
  source_id?: string;
  user_tags?: string[]; // Custom user defined tags
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  id?: string; // Database ID for editing
  source: string | GraphNode;
  target: string | GraphNode;
  type?: string;
  data?: TableRow;
}

export interface GraphConfig {
  nodeTable: string;
  edgeTable: string;
  nodeIdCol: string;
  nodeLabelCol: string;
  nodeTypeCol: string;
  edgeSourceCol: string;
  edgeTargetCol: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isTrace?: boolean; 
  data?: {
    nodes?: any[];
    edges?: any[];
  };
}

export type LensType = 'All' | 'Social' | 'Strategic' | 'Operational' | 'Creative' | 'Pathways' | 'AnchorFocus';