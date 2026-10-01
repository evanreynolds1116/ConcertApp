"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

/**
 * A lineup row. `key` keeps rows stable while they're dragged. Rows from setlist.fm carry an
 * MBID; rows of a saved log carry the artist's id; rows typed in carry just a name.
 */
export type LineupRow = {
  key: string;
  name: string;
  mbid: string | null;
  setlistfmUrl: string | null;
  artistId?: string;
};

let nextKey = 0;
export function lineupRow(artist: Omit<LineupRow, "key">): LineupRow {
  return { ...artist, key: `row-${nextKey++}` };
}

type LineupEditorProps = {
  rows: LineupRow[];
  onChange: (rows: LineupRow[]) => void;
};

/** The lineup list (drag or arrows to reorder, remove) plus "Add an artist". */
export function LineupEditor({ rows, onChange }: LineupEditorProps) {
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.key === active.id);
    const to = rows.findIndex((r) => r.key === over.id);
    onChange(arrayMove(rows, from, to));
  }

  function add() {
    const name = newName.trim();
    if (!name) return;
    if (name.length > 200) {
      setAddError("That name is too long.");
      return;
    }
    if (rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      setAddError(`${name} is already in the lineup.`);
      return;
    }
    onChange([...rows, lineupRow({ name, mbid: null, setlistfmUrl: null })]);
    setNewName("");
    setAddError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Drag to reorder, or use the arrows. Remove anyone you didn&apos;t see. The top artist is the
        headliner.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2" aria-label="Lineup">
            {rows.map((row, i) => (
              <SortableRow
                key={row.key}
                row={row}
                position={i + 1}
                onUp={i > 0 ? () => onChange(arrayMove(rows, i, i - 1)) : undefined}
                onRemove={() => onChange(rows.filter((r) => r.key !== row.key))}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-surface-raised p-4 text-center text-sm text-muted">
          Add at least one artist to continue.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="add-artist" className="text-xs font-bold text-muted">
          Add an artist
        </label>
        <div className="flex gap-2">
          <input
            id="add-artist"
            type="text"
            autoComplete="off"
            placeholder="Artist or band name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            aria-describedby={addError ? "add-artist-error" : undefined}
            className="h-11 min-w-0 flex-1 rounded-lg border border-surface-raised bg-surface px-3 text-base outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={add}
            className="h-11 rounded-full border border-accent px-4.5 font-bold text-accent hover:bg-accent hover:text-on-accent"
          >
            Add
          </button>
        </div>
        {addError && (
          <p id="add-artist-error" role="alert" className="text-sm text-danger">
            {addError}
          </p>
        )}
      </div>
    </div>
  );
}

type SortableRowProps = {
  row: LineupRow;
  position: number;
  onUp?: () => void;
  onRemove: () => void;
};

function SortableRow({ row, position, onUp, onRemove }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.key });
  const isHeadliner = position === 1;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-h-15 items-center gap-2 rounded-xl bg-surface pr-1 pl-1 ${isDragging ? "relative z-10 shadow-lg ring-1 ring-accent" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${row.name}`}
        className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-subtle active:cursor-grabbing"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden
          className="fill-none stroke-current stroke-3"
        >
          <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeLinecap="round" />
        </svg>
      </button>
      <span className="w-5 text-center text-sm font-bold text-muted">{position}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-bold">{row.name}</span>
        {isHeadliner && (
          <span className="self-start rounded-full bg-accent px-2 text-[11px] font-bold text-on-accent">
            Headliner
          </span>
        )}
      </span>
      {onUp ? (
        <button
          type="button"
          onClick={onUp}
          aria-label={`Move ${row.name} up`}
          className="flex size-11 items-center justify-center rounded-full hover:bg-surface-raised"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden
            className="fill-none stroke-current stroke-2"
          >
            <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span className="size-11" aria-hidden />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${row.name}`}
        className="flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-raised hover:text-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden
          className="fill-none stroke-current stroke-2"
        >
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}
