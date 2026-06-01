import { v4 as uuidv4 } from 'uuid';
import { STAGE_ORDER, STAGE_OWNERS } from '../types.js';
import type { Sprint, Stage, StageName, SprintBudget } from '../types.js';
import type { AdapterSet } from '../adapters/interfaces.js';
import type { FileState } from '../state/index.js';
import { checkGate } from './gates.js';

export type AdvanceResult =
  | { ok: true; sprint: Sprint; from: StageName; to: StageName | 'complete' }
  | { ok: false; reason: string; escalated?: boolean };

export class SprintRunner {
  constructor(private state: FileState, private adapters: AdapterSet) {}

  getCurrentStage(sprint: Sprint): Stage | null {
    return (
      sprint.stages.find(s => s.status === 'in_progress') ??
      sprint.stages.find(s => s.status === 'escalated') ??
      null
    );
  }

  getNextStage(sprint: Sprint): StageName | null {
    const current = this.getCurrentStage(sprint);
    if (!current) return null;
    const idx = STAGE_ORDER.indexOf(current.name);
    if (idx === -1 || idx === STAGE_ORDER.length - 1) return null;
    return STAGE_ORDER[idx + 1];
  }

  async createSprint(goal: string, roadmapRef?: string): Promise<Sprint> {
    const existing = await this.state.listSprints();
    const n = existing.length + 1;
    const id = `sprint-${String(n).padStart(2, '0')}`;
    const now = new Date().toISOString();

    const stages: Stage[] = STAGE_ORDER.map((name, i) => ({
      name,
      owner: STAGE_OWNERS[name],
      status: i === 0 ? ('in_progress' as const) : ('pending' as const),
    }));

    const sprint: Sprint = {
      id,
      goal,
      stages,
      budget: {},
      created_at: now,
    };
    if (roadmapRef !== undefined) sprint.roadmap_ref = roadmapRef;

    await this.state.writeSprint(sprint, `# Sprint: ${goal}\n`);

    await this.state.appendEvent({
      actor: 'system',
      sprint: id,
      stage: 'intake',
      type: 'message',
      note: `sprint.created: ${goal}`,
    });

    return sprint;
  }

  async advance(sprintId: string, toStage?: StageName): Promise<AdvanceResult> {
    const sprint = await this.state.readSprint(sprintId);
    const current = this.getCurrentStage(sprint);

    if (!current) {
      return { ok: false, reason: 'No active or escalated stage found for this sprint' };
    }

    const fromStage = current.name;
    const nextStage = toStage ?? this.getNextStage(sprint);

    if (!nextStage) {
      // Terminal stage (retro) — mark it done and signal sprint complete
      const updatedStages = sprint.stages.map(s =>
        s.name === fromStage ? { ...s, status: 'done' as const } : s,
      );
      const updatedSprint: Sprint = { ...sprint, stages: updatedStages };
      await this.state.writeSprint(updatedSprint);
      await this.state.appendEvent({
        actor: 'system',
        sprint: sprintId,
        stage: fromStage,
        type: 'transition',
        note: `${fromStage} → complete`,
      });
      return { ok: true, sprint: updatedSprint, from: fromStage, to: 'complete' };
    }

    // Check 1: Legal direct edge in STAGE_ORDER
    const fromIdx = STAGE_ORDER.indexOf(fromStage);
    const toIdx = STAGE_ORDER.indexOf(nextStage);

    if (fromIdx === -1 || toIdx === -1 || toIdx !== fromIdx + 1) {
      const reason = `Illegal transition: ${fromStage} → ${nextStage} (must follow stage order)`;
      await this.state.appendEvent({
        actor: 'system',
        sprint: sprintId,
        stage: fromStage,
        type: 'message',
        note: reason,
      });
      return { ok: false, reason };
    }

    // Check 2: Gate condition for the current (from) stage
    const gate = await checkGate(fromStage, sprintId, this.state);
    if (!gate.passes) {
      const reason = gate.reason ?? `Gate condition not met for stage: ${fromStage}`;
      await this.state.appendEvent({
        actor: 'system',
        sprint: sprintId,
        stage: fromStage,
        type: 'message',
        note: reason,
      });
      return { ok: false, reason };
    }

    // Check 3: Budget not exhausted
    const budgetCheck = this.checkBudget(sprint.budget);
    if (!budgetCheck.ok) {
      // Escalate: mark current stage as escalated, append signoff_request
      const requestId = uuidv4();
      const updatedStages = sprint.stages.map(s =>
        s.name === fromStage ? { ...s, status: 'escalated' as const } : s,
      );
      const updatedSprint: Sprint = { ...sprint, stages: updatedStages };
      await this.state.writeSprint(updatedSprint);

      await this.state.appendEvent({
        actor: 'system',
        sprint: sprintId,
        stage: fromStage,
        type: 'signoff_request',
        ref: requestId,
        note: `Budget exhausted: ${budgetCheck.reason}`,
      });

      return { ok: false, reason: budgetCheck.reason, escalated: true };
    }

    // All checks passed — advance the sprint
    const updatedStages = sprint.stages.map(s => {
      if (s.name === fromStage) return { ...s, status: 'done' as const };
      if (s.name === nextStage) return { ...s, status: 'in_progress' as const };
      return s;
    });

    const updatedSprint: Sprint = { ...sprint, stages: updatedStages };
    await this.state.writeSprint(updatedSprint);

    await this.state.appendEvent({
      actor: 'system',
      sprint: sprintId,
      stage: fromStage,
      type: 'transition',
      note: `${fromStage} → ${nextStage}`,
    });

    return { ok: true, sprint: updatedSprint, from: fromStage, to: nextStage };
  }

  private checkBudget(budget: SprintBudget): { ok: boolean; reason: string } {
    if (
      budget.max_tokens !== undefined &&
      budget.tokens_used !== undefined &&
      budget.tokens_used >= budget.max_tokens
    ) {
      return {
        ok: false,
        reason: `Token budget exhausted: ${budget.tokens_used}/${budget.max_tokens} tokens used`,
      };
    }
    if (
      budget.max_cost_usd !== undefined &&
      budget.cost_used_usd !== undefined &&
      budget.cost_used_usd >= budget.max_cost_usd
    ) {
      return {
        ok: false,
        reason: `Cost budget exhausted: $${budget.cost_used_usd}/$${budget.max_cost_usd} used`,
      };
    }
    return { ok: true, reason: '' };
  }
}
