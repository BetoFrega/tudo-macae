# Visual reference transfer

This is the tracker authority for a visual reference that becomes an implementation
or review requirement. The local file policy remains in
[Impeccable Artifacts](impeccable-artifacts.md), including preservation and deletion
authority. A transfer makes one selected revision recoverable by another checkout; it
does not approve details outside the recorded scope.

## Exploration boundary

Keep unselected explorations local. They need neither a spec nor a retroactive archive.
This workflow starts when one exact reference is selected to guide implementation or
review.

Put shared intent in the parent spec. Put ticket-specific requirements, exact attachment
URLs and the selected revision in the executable ticket or one of its comments. Link the
ticket to the spec instead of copying the whole reference set into every ticket.

## Freeze approval and revision

Treat each selected revision as immutable. Assign a revision identifier and record every
required file, including the prompt or other sidecar needed to understand it. Compute a
SHA-256 digest and byte count for each file before upload.

Record explicit approval where future executors will read it. Shared intent may be
approved in the spec; a ticket-bound revision, its exact attachments, scope and
limitations belong in that ticket or one of its comments. State the author and cite the
conversation or task in which approval was given. An explicit delegation may authorize
the agent to select a revision only when that delegation says so. A general request for
visual work is not approval.

Use this record shape, in Portuguese because it becomes tracker content:

```markdown
## Referência visual — revisão <id>

- **Estado da transferência:** `pendente` | `completa`
- **Aprovação:** <autor e fonte da aprovação explícita>
- **Escopo aprovado:** <o que esta revisão orienta>
- **Limitações:** <o que não foi aprovado ou não pode ser inferido>
- **Arquivos necessários:**
  - `<nome>` — <URL persistente exata> — SHA-256 `<digest>` — <bytes> bytes
- **Tickets dependentes:** <links ou “nenhum”>
- **Verificação:** <checkout, data e comandos/resultados reproduzíveis>
```

A new revision gets a new record, digests and approval. Keep the previous record intact.
State which open tickets, if any, move to the new revision; never replace their target
silently.

## Transfer and verify

Use the existing tracker attachment path or another persistent resource already
authorized for the project. Prefer automated attachment when the available integration
supports it. A one-off manual upload through the tracker is the accepted fallback. Do
not introduce a storage service for this workflow without demonstrated need and a
separate decision.

Before upload, confirm that every file is synthetic or explicitly authorized for the
exact ticket or PR receiving it. That authority does not extend to another destination
or to unrelated user content. Apply the local preservation policy throughout.

A repository path, machine-local path, temporary URL, expiring link or the mere presence
of a URL leaves the transfer pending. A transfer is complete only after all of these
checks pass:

1. Every required file and sidecar is listed by its exact persistent URL.
2. A fresh download returns the intended bytes, not an error or HTML interstitial.
3. Each downloaded digest matches its frozen revision.
4. A checkout without the source files can materialize the package under an ignored
   Impeccable path.
5. The non-live reader can consume the recovered reference and its required provenance.

Resolve `<installed-skill-scripts>` from Impeccable in the current skill catalog.
For an Impeccable raster, a suitable non-live proof is:

```bash
shasum -a 256 <downloaded-file>
git check-ignore --verbose --no-index <downloaded-file> <required-sidecar>
node <installed-skill-scripts>/embed-prompt.mjs <downloaded-file> --read
```

Run the byte retrieval, digest, ignore and reader checks as automated commands. Record
their outputs separately from assisted steps: human approval and a manual attachment
fallback remain assisted and must not be presented as automated proof.

Download to a ticket-and-revision-specific location such as
`.impeccable/references/<ticket>/<revision>/`. Materialize only the files the record
declares. The tracker remains canonical; the ignored copies are working material. Do not
start live merely to inspect a reference.

Recovering one image proves only that image. It does not prove that an originating mock,
prompt, approval record or other sidecar can be reconstructed. List each required item
separately and verify the complete package.

## Failure and readiness

When automated transfer fails, record the failing operation, affected files and next
manual step while the local preservation policy remains in force. Mark only tickets
that require that reference as pending or blocked for independent execution. Independent
tickets remain eligible.

Manual upload completes the same verification; it is not complete at the upload step.
Do not close a dependent ticket as visually validated while any required file,
corresponding revision or approval scope remains uncertain. Committing a binary is not a
fallback.

## Implementation and review preflight

Before implementing or reviewing a bound ticket:

1. Read the parent intent, ticket-specific requirements, all reference records and later
   comments.
2. Confirm the recorded transfer is complete and the ticket still targets that revision.
3. Recover the exact files in a checkout that does not rely on the author's old copies,
   then verify their digests and non-live readability.
4. Use the recorded scope and limitations as the visual contract. Do not infer approval
   of unlisted details.
5. Apply the local preservation policy to the recovered package and any older copies.

Completion evidence names the tracker record, exact revision, retrieval result, digest
result, ignored paths and reader output. Distinguish automated checks from assisted
steps such as human approval or manual attachment.
