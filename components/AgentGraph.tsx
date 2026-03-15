"use client";

import { useEffect } from "react";
import {
  ReactFlow, Background,
  useNodesState, useEdgesState,
  Position, Handle, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type NodeStatus = "idle" | "running" | "success" | "error";
export type PipelineStage = "idle" | "qa" | "verify" | "decision" | "done" | "error";

interface AgentNodeData { label: string; sub: string; icon: string; status: NodeStatus; }

// ── One custom node component ─────────────────────────────────────────────────
function AgentNode({ data }: NodeProps) {
  const d = data as AgentNodeData;
  const border: Record<NodeStatus, string> = {
    idle: "border-zinc-700 bg-zinc-900/80",
    running: "border-cyan-500 bg-cyan-950/30 glow-cyan",
    success: "border-emerald-500 bg-emerald-950/20 glow-green",
    error: "border-red-500 bg-red-950/30 glow-red",
  };
  const dot: Record<NodeStatus, string> = {
    idle: "bg-zinc-600", running: "bg-cyan-400 animate-pulse",
    success: "bg-emerald-400", error: "bg-red-400 animate-pulse",
  };
  return (
    <motion.div
      animate={d.status === "running" ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={{ duration: 1.2, repeat: d.status === "running" ? Infinity : 0 }}
      className={cn("relative px-4 py-3 rounded-lg border min-w-[140px] text-center transition-all duration-300", border[d.status])}
    >
      <Handle type="target" position={Position.Top} />
      <div className={cn("absolute top-2 right-2 w-2 h-2 rounded-full", dot[d.status])} />
      <div className="text-xl mb-0.5">{d.icon}</div>
      <div className="font-mono text-xs font-bold text-zinc-100">{d.label}</div>
      <div className="font-mono text-[10px] text-zinc-500 mt-0.5">{d.sub}</div>
      <Handle type="source" position={Position.Bottom} />
    </motion.div>
  );
}

// ── Initial nodes & edges ─────────────────────────────────────────────────────
const INIT_NODES = [
  { id: "1", type: "agentNode", position: { x: 150, y: 10 }, data: { label: "USER QUERY", sub: "input", icon: "⌨", status: "idle" } },
  { id: "2", type: "agentNode", position: { x: 150, y: 110 }, data: { label: "PRIMARY AI", sub: "llm", icon: "◈", status: "idle" } },
  { id: "3", type: "agentNode", position: { x: 10, y: 240 }, data: { label: "FACT CHECKER", sub: "agent-02", icon: "⊡", status: "idle" } },
  { id: "4", type: "agentNode", position: { x: 150, y: 240 }, data: { label: "HALLUC ENGINE", sub: "agent-03", icon: "⚡", status: "idle" } },
  { id: "5", type: "agentNode", position: { x: 290, y: 240 }, data: { label: "CITATION VFR", sub: "agent-04", icon: "⊞", status: "idle" } },
  { id: "6", type: "agentNode", position: { x: 150, y: 370 }, data: { label: "DECISION AGENT", sub: "final arbiter", icon: "⬡", status: "idle" } },
];
const GRAY = "#3f3f46";
const INIT_EDGES = [
  { id: "e1-2", source: "1", target: "2", style: { stroke: GRAY, strokeWidth: 1.5 } },
  { id: "e2-3", source: "2", target: "3", style: { stroke: GRAY, strokeWidth: 1.5 } },
  { id: "e2-4", source: "2", target: "4", style: { stroke: GRAY, strokeWidth: 1.5 } },
  { id: "e2-5", source: "2", target: "5", style: { stroke: GRAY, strokeWidth: 1.5 } },
  { id: "e3-6", source: "3", target: "6", style: { stroke: GRAY, strokeWidth: 1.5 } },
  { id: "e4-6", source: "4", target: "6", style: { stroke: GRAY, strokeWidth: 1.5 } },
  { id: "e5-6", source: "5", target: "6", style: { stroke: GRAY, strokeWidth: 1.5 } },
];

// Stage → node statuses & edge colors
type StageCfg = { nodes: Record<string, NodeStatus>; edges: Record<string, { c: string; a: boolean }> };
const STAGES: Record<PipelineStage, StageCfg> = {
  idle: { nodes: { 1: "idle", 2: "idle", 3: "idle", 4: "idle", 5: "idle", 6: "idle" }, edges: {} },
  qa: { nodes: { 1: "success", 2: "running", 3: "idle", 4: "idle", 5: "idle", 6: "idle" }, edges: { "e1-2": { c: "#22d3ee", a: true } } },
  verify: { nodes: { 1: "success", 2: "success", 3: "running", 4: "running", 5: "running", 6: "idle" }, edges: { "e1-2": { c: "#34d399", a: false }, "e2-3": { c: "#22d3ee", a: true }, "e2-4": { c: "#22d3ee", a: true }, "e2-5": { c: "#22d3ee", a: true } } },
  decision: { nodes: { 1: "success", 2: "success", 3: "success", 4: "success", 5: "success", 6: "running" }, edges: { "e2-3": { c: "#34d399", a: false }, "e2-4": { c: "#34d399", a: false }, "e2-5": { c: "#34d399", a: false }, "e3-6": { c: "#22d3ee", a: true }, "e4-6": { c: "#22d3ee", a: true }, "e5-6": { c: "#22d3ee", a: true } } },
  done: { nodes: { 1: "success", 2: "success", 3: "success", 4: "success", 5: "success", 6: "success" }, edges: { "e3-6": { c: "#34d399", a: false }, "e4-6": { c: "#34d399", a: false }, "e5-6": { c: "#34d399", a: false } } },
  error: { nodes: { 1: "success", 2: "success", 3: "success", 4: "error", 5: "success", 6: "error" }, edges: { "e2-4": { c: "#ef4444", a: false }, "e4-6": { c: "#ef4444", a: true } } },
};

export function AgentGraph({ stage }: { stage: PipelineStage }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(INIT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INIT_EDGES);

  useEffect(() => {
    const cfg = STAGES[stage];
    setNodes(ns => ns.map(n => ({ ...n, data: { ...n.data, status: cfg.nodes[n.id] ?? "idle" } })));
    setEdges(es => es.map(e => ({
      ...e,
      animated: cfg.edges[e.id]?.a ?? false,
      style: { stroke: cfg.edges[e.id]?.c ?? GRAY, strokeWidth: 1.5 },
    })));
  }, [stage]);

  return (
    <ReactFlow
      nodes={nodes} edges={edges}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={{ agentNode: AgentNode }}
      fitView fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false} nodesConnectable={false}
      elementsSelectable={false} zoomOnScroll={false}
      panOnScroll={false} panOnDrag={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#27272a" gap={24} size={1} />
    </ReactFlow>
  );
}
