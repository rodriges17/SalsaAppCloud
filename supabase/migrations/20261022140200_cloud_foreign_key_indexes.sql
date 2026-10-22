-- Cover foreign-key joins and parent-row checks without changing access rules.
create index if not exists cloud_entries_pending_id_idx on public.cloud_entries(pending_id);
create index if not exists cloud_entries_published_id_idx on public.cloud_entries(published_id);
create index if not exists cloud_figures_owner_id_idx on public.cloud_figures(owner_id);
create index if not exists cloud_jobs_figure_id_idx on public.cloud_jobs(figure_id);
create index if not exists cloud_jobs_owner_id_idx on public.cloud_jobs(owner_id);
create index if not exists cloud_libraries_owner_id_idx on public.cloud_libraries(owner_id);
create index if not exists cloud_media_figure_id_idx on public.cloud_media(figure_id);
create index if not exists cloud_media_job_id_idx on public.cloud_media(job_id);
