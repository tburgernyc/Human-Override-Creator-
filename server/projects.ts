// JSON file-based project persistence (replaces better-sqlite3 for Node 24 compat)

import { Router } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const VERSIONS_FILE = path.join(DATA_DIR, 'versions.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface ProjectRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  data_json: string;
}

interface VersionRow {
  id: string;
  project_id: string;
  name: string;
  created_at: number;
  data_json: string;
}

function readProjects(): ProjectRow[] {
  try {
    if (!fs.existsSync(PROJECTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
  } catch { return []; }
}

function writeProjects(rows: ProjectRow[]): void {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(rows, null, 2), 'utf-8');
}

function readVersions(): VersionRow[] {
  try {
    if (!fs.existsSync(VERSIONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf-8'));
  } catch { return []; }
}

function writeVersions(rows: VersionRow[]): void {
  fs.writeFileSync(VERSIONS_FILE, JSON.stringify(rows, null, 2), 'utf-8');
}

export const projectsRouter = Router();

// List all projects
projectsRouter.get('/', (_req, res) => {
  try {
    const rows = readProjects()
      .sort((a, b) => b.updated_at - a.updated_at)
      .map(({ id, name, created_at, updated_at }) => ({ id, name, created_at, updated_at }));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Create project
projectsRouter.post('/', (req, res) => {
  try {
    const { name, data } = req.body;
    if (!name || !data) return res.status(400).json({ error: 'name and data are required' });
    const id = randomUUID();
    const now = Date.now();
    const projects = readProjects();
    projects.push({ id, name, created_at: now, updated_at: now, data_json: JSON.stringify(data) });
    writeProjects(projects);
    res.json({ id, name, created_at: now, updated_at: now });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get project by ID
projectsRouter.get('/:id', (req, res) => {
  try {
    const row = readProjects().find(p => p.id === req.params.id);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    res.json({ ...row, data: JSON.parse(row.data_json) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Update project
projectsRouter.put('/:id', (req, res) => {
  try {
    const { name, data } = req.body;
    const now = Date.now();
    const projects = readProjects();
    const idx = projects.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Project not found' });
    if (name) projects[idx].name = name;
    if (data) projects[idx].data_json = JSON.stringify(data);
    projects[idx].updated_at = now;
    writeProjects(projects);
    res.json({ id: req.params.id, updated_at: now });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Delete project
projectsRouter.delete('/:id', (req, res) => {
  try {
    const projects = readProjects().filter(p => p.id !== req.params.id);
    writeProjects(projects);
    const versions = readVersions().filter(v => v.project_id !== req.params.id);
    writeVersions(versions);
    res.json({ deleted: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Save named version
projectsRouter.post('/:id/versions', (req, res) => {
  try {
    const { name, data } = req.body;
    if (!name || !data) return res.status(400).json({ error: 'name and data are required' });
    const id = randomUUID();
    const now = Date.now();
    const versions = readVersions();
    versions.push({ id, project_id: req.params.id, name, created_at: now, data_json: JSON.stringify(data) });
    writeVersions(versions);
    res.json({ id, project_id: req.params.id, name, created_at: now });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// List versions
projectsRouter.get('/:id/versions', (req, res) => {
  try {
    const rows = readVersions()
      .filter(v => v.project_id === req.params.id)
      .sort((a, b) => b.created_at - a.created_at)
      .map(({ id, project_id, name, created_at }) => ({ id, project_id, name, created_at }));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Load specific version
projectsRouter.get('/:id/versions/:versionId', (req, res) => {
  try {
    const row = readVersions().find(v => v.id === req.params.versionId && v.project_id === req.params.id);
    if (!row) return res.status(404).json({ error: 'Version not found' });
    res.json({ ...row, data: JSON.parse(row.data_json) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
