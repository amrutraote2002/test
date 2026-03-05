"use client";

import React, { useEffect, useState, useCallback } from "react";
import Image from "next/image";

import {
  ChevronDown, Github, Link2, RefreshCcw, Lock, Globe,
  CheckCircle2, Circle, Loader2, AlertCircle, Settings,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bounce, toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "@/app/lib/store/hooks";
import { fetchOrganizations, setSelectedOrganization } from "@/app/lib/store/features/organizationSlice";
import { fetchProjects } from "@/app/lib/store/features/projectSlice";
import { fetchGithubRepos, clearGithubRepos } from "@/app/lib/store/features/githubSlice";

const API_BASE = process.env.API_BASE_URL!;
const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG!;

type LinkingState = "idle" | "loading" | "success" | "error";

type SessionData = {
  githubId: string;
  avatarUrl: string;
  installationId?: number;
  githubAccessToken?: string;
  setupAction?: string;
};

export default function TestPage() {
  const dispatch = useAppDispatch();

  // ── Session (read from /api/auth/github/session) ─────────────────────────────────
  const [session, setSession] = useState<SessionData | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/github/session")
      .then((r) => r.json())
      .then((data) => setSession(data.session ?? null))
      .catch(() => setSession(null));
  }, []);

  // ── Redux ─────────────────────────────────────────────────────────────────
  const {
    selectedOrg, list: orgs,
    loading: orgsLoading, initialized: orgsInitialized,
  } = useAppSelector((s) => s.organization);

  const {
    list: projects, loading: projectsLoading, lastFetchedOrgId,
  } = useAppSelector((s) => s.projects);

  const {
    repos, loading: reposLoading, fetched: reposFetched, error: reposError,
  } = useAppSelector((s) => s.github);

  // ── Local state ───────────────────────────────────────────────────────────
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<number>>(new Set());
  const [linkingStates, setLinkingStates] = useState<Record<number, LinkingState>>({});
  const [isLinking, setIsLinking] = useState(false);

  // ── Data fetching — only once GitHub is connected ─────────────────────────
  useEffect(() => {
    if (!session?.installationId) return;
    if (!orgsInitialized && !orgsLoading) dispatch(fetchOrganizations());
    if (!reposFetched && !reposLoading) dispatch(fetchGithubRepos());
  }, [session, orgsInitialized, orgsLoading, reposFetched, reposLoading, dispatch]);

  useEffect(() => {
    if (selectedOrg?.id && selectedOrg.id !== lastFetchedOrgId) {
      dispatch(fetchProjects(selectedOrg.id));
      setSelectedProjectId(null);
      setSelectedRepoIds(new Set());
    }
  }, [selectedOrg, lastFetchedOrgId, dispatch]);

  // Auto-select first project
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleOrgChange = useCallback((orgId: string) => {
    const org = orgs.find((o) => o.id === orgId);
    if (org) dispatch(setSelectedOrganization(org));
  }, [orgs, dispatch]);

  const toggleRepo = useCallback((repoId: number) => {
    setSelectedRepoIds((prev) => {
      const next = new Set(prev);
      next.has(repoId) ? next.delete(repoId) : next.add(repoId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedRepoIds(
      selectedRepoIds.size === repos.length
        ? new Set()
        : new Set(repos.map((r) => r.id))
    );
  }, [repos, selectedRepoIds]);

  const handleRefreshRepos = useCallback(() => {
    dispatch(clearGithubRepos());
    dispatch(fetchGithubRepos());
  }, [dispatch]);

const handleLinkRepos = useCallback(async () => {
  if (!selectedProjectId) { toast.error("Please select a project first"); return; }
  if (selectedRepoIds.size === 0) { toast.error("Please select at least one repository"); return; }

  setIsLinking(true);
  const reposToLink = repos.filter((r) => selectedRepoIds.has(r.id));
  setLinkingStates(Object.fromEntries(reposToLink.map((r) => [r.id, "loading" as LinkingState])));

  const results = await Promise.allSettled(
    reposToLink.map(async (repo) => {
      const res = await fetch("/api/auth/github/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          repositoryId: repo.id,
          owner: repo.owner,
          repositoryName: repo.name,
          branch: repo.defaultBranch,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? res.statusText);
      }

      return repo.id;
    })
  );

  const newStates: Record<number, LinkingState> = {};
  let successCount = 0;
  let errorCount = 0;

  results.forEach((result, i) => {
    const id = reposToLink[i].id;
    if (result.status === "fulfilled") { newStates[id] = "success"; successCount++; }
    else { newStates[id] = "error"; errorCount++; }
  });

  setLinkingStates(newStates);
  setIsLinking(false);

  if (successCount > 0) toast.success(`${successCount} ${successCount === 1 ? "repository" : "repositories"} linked!`, { position: "bottom-right", transition: Bounce });
  if (errorCount > 0) toast.error(`${errorCount} failed to link`, { position: "bottom-right", transition: Bounce });
}, [selectedProjectId, selectedRepoIds, repos]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const allSelected = repos.length > 0 && selectedRepoIds.size === repos.length;

  // ── Session loading ───────────────────────────────────────────────────────
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0e0e0e]">
        <Loader2 className="size-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  // ── Not logged in at all ──────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0e0e0e] px-4">
        <div className="flex flex-col items-center gap-5 text-center max-w-sm">
          <div className="p-4 rounded-2xl bg-gray-100 dark:bg-white/5">
            <Github className="size-10 text-gray-700 dark:text-gray-300" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Connect GitHub</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Install the BugByBug GitHub App to link your repositories to your projects.
            </p>
          </div>
          <a href="/api/auth/github/login" className="w-full">
            <button className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white text-sm font-medium rounded-xl transition-colors">
              <Github className="size-4" />
              Connect with GitHub
            </button>
          </a>
        </div>
      </div>
    );
  }

  // ── Logged in but GitHub App not installed ────────────────────────────────
  if (!session.installationId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0e0e0e] px-4">
        <div className="flex flex-col items-center gap-5 text-center max-w-sm">
          <div className="relative">
            {/* <Image src={session.avatarUrl} width={64} height={64} alt="avatar" className="rounded-full" /> */}
            <div className="absolute -bottom-1 -right-1 p-1 bg-yellow-400 rounded-full">
              <AlertCircle className="size-3 text-yellow-900" />
            </div>
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Install GitHub App</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Hi <span className="font-medium text-gray-700 dark:text-gray-300">{session.githubId}</span>! You're connected but haven't installed the GitHub App yet. Install it to select which repositories BugByBug can access.
            </p>
          </div>
          <a href={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`} className="w-full">
            <button className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white text-sm font-medium rounded-xl transition-colors">
              <Github className="size-4" />
              Install GitHub App
            </button>
          </a>
        </div>
      </div>
    );
  }

  // ── Main UI: GitHub connected + app installed ─────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0e0e0e]">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <Github className="size-4" />
              <span>GitHub Integration</span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Link Repositories</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Select a project and choose the repositories you want to link to it.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <a
              href={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                <Settings className="size-3.5" />
                Manage repositories
              </button>
            </a>
            <div className="flex items-center gap-2">
              {/* <Image src={session.avatarUrl} width={32} height={32} alt="avatar" className="rounded-full" /> */}
              <span className="text-sm text-gray-700 dark:text-gray-300 hidden sm:block">{session.githubId}</span>
            </div>
          </div>
        </div>

        {/* Org + Project selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Organization
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#161616] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all">
                <span className="truncate">{orgsLoading ? "Loading..." : selectedOrg?.name ?? "Select organization"}</span>
                <ChevronDown className="size-4 text-gray-400 flex-shrink-0 ml-2" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[var(--radix-popper-anchor-width)] bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl shadow-lg">
                {orgs.map((org) => (
                  <DropdownMenuItem key={org.id} onClick={() => handleOrgChange(org.id)}
                    className="px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg mx-1 my-0.5">
                    {org.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Project
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={!selectedOrg || projectsLoading}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#161616] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="truncate">
                  {projectsLoading ? "Loading..."
                    : !selectedOrg ? "Select an organization first"
                    : selectedProject?.name ?? "Select project"}
                </span>
                <ChevronDown className="size-4 text-gray-400 flex-shrink-0 ml-2" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[var(--radix-popper-anchor-width)] bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl shadow-lg">
                {projects.length === 0 ? (
                  <DropdownMenuItem disabled className="px-4 py-2.5 text-sm text-gray-400">No projects found</DropdownMenuItem>
                ) : projects.map((project) => (
                  <DropdownMenuItem key={project.id} onClick={() => setSelectedProjectId(project.id)}
                    className="px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg mx-1 my-0.5">
                    <span className="flex items-center gap-2">
                      {project.name}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${project.isActive
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                        {project.isActive ? "Active" : "Inactive"}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Repo list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">GitHub Repositories</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {reposFetched
                  ? `${repos.length} ${repos.length === 1 ? "repository" : "repositories"} accessible`
                  : "Fetching repositories..."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {repos.length > 0 && (
                <button onClick={toggleAll}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              )}
              <button onClick={handleRefreshRepos} disabled={reposLoading} title="Refresh repositories"
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50">
                <RefreshCcw className={`size-4 ${reposLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Skeletons */}
          {reposLoading && (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse" />
              ))}
            </div>
          )}

          {/* Error */}
          {reposError && !reposLoading && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle className="size-4 flex-shrink-0" />
              <span>{reposError}</span>
            </div>
          )}

          {/* Empty */}
          {reposFetched && !reposLoading && repos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
              <Github className="size-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No repositories found</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Make sure you granted access to repositories during installation
              </p>
              <a href={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`} target="_blank" rel="noopener noreferrer" className="mt-4">
                <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 transition-opacity">
                  <Settings className="size-3.5" />
                  Update repository access
                </button>
              </a>
            </div>
          )}

          {/* Repo cards */}
          {!reposLoading && repos.length > 0 && (
            <div className="space-y-2">
              {repos.map((repo) => {
                const isSelected = selectedRepoIds.has(repo.id);
                const linkState = linkingStates[repo.id] ?? "idle";
                return (
                  <button key={repo.id}
                    onClick={() => linkState !== "loading" && toggleRepo(repo.id)}
                    disabled={linkState === "loading"}
                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border text-left transition-all duration-150
                      ${isSelected
                        ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
                        : "border-gray-200 dark:border-white/10 bg-white dark:bg-[#161616] hover:border-gray-300 dark:hover:border-white/20"}
                      ${linkState === "loading" ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <div className="flex-shrink-0">
                      {linkState === "loading" ? <Loader2 className="size-5 text-primary animate-spin" />
                        : linkState === "success" ? <CheckCircle2 className="size-5 text-green-500" />
                        : linkState === "error" ? <AlertCircle className="size-5 text-red-500" />
                        : isSelected ? <CheckCircle2 className="size-5 text-primary" />
                        : <Circle className="size-5 text-gray-300 dark:text-gray-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900 dark:text-white truncate">{repo.fullName}</span>
                        <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md flex-shrink-0
                          ${repo.private
                            ? "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400"
                            : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"}`}>
                          {repo.private ? <><Lock className="size-3" />Private</> : <><Globe className="size-3" />Public</>}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        Default branch: <span className="font-mono">{repo.defaultBranch}</span>
                      </p>
                    </div>
                    {linkState === "success" && <span className="text-xs text-green-600 dark:text-green-400 font-medium flex-shrink-0">Linked</span>}
                    {linkState === "error" && <span className="text-xs text-red-500 font-medium flex-shrink-0">Failed</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer action */}
        {repos.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-white/10">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {selectedRepoIds.size > 0 ? (
                <span>
                  <span className="font-medium text-gray-900 dark:text-white">{selectedRepoIds.size}</span>
                  {" "}{selectedRepoIds.size === 1 ? "repository" : "repositories"} selected
                  {selectedProject && <>  → <span className="font-medium text-gray-900 dark:text-white">{selectedProject.name}</span></>}
                </span>
              ) : "Select repositories to link"}
            </p>
            <button
              onClick={handleLinkRepos}
              disabled={isLinking || selectedRepoIds.size === 0 || !selectedProjectId}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
            >
              {isLinking
                ? <><Loader2 className="size-4 animate-spin" />Linking...</>
                : <><Link2 className="size-4" />Link {selectedRepoIds.size > 0 ? selectedRepoIds.size : ""} {selectedRepoIds.size === 1 ? "Repository" : "Repositories"}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}