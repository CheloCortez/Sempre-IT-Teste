/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  app.runInTransaction((txApp) => {
    const venues = txApp.findCollectionByNameOrId("venues");
    let schemaChanged = false;
    let coverageStatus = venues.fields.find(
      (field) => field.name === "coverage_status",
    );

    // A partial prior run may already have added the field. Keep the collection
    // intact and only add or normalize this optional, API-readable field.
    if (!coverageStatus) {
      coverageStatus = new TextField({
        name: "coverage_status",
        required: false,
        hidden: false,
      });
      venues.fields.push(coverageStatus);
      schemaChanged = true;
    } else {
      if (coverageStatus.required) {
        coverageStatus.required = false;
        schemaChanged = true;
      }
      if (coverageStatus.hidden) {
        coverageStatus.hidden = false;
        schemaChanged = true;
      }
    }

    if (schemaChanged) {
      txApp.save(venues);
    }

    // One bulk, idempotent update backfills only the verified launch-venue
    // facts. It deliberately does not read or alter the legacy indoor field.
    txApp
      .db()
      .newQuery(`
        UPDATE venues
        SET coverage_status = CASE slug
          WHEN 'pickleball-point-arena' THEN 'coberta'
          WHEN 'olimpia-arena-pickleball' THEN 'nao_confirmada'
          WHEN 'reinaldo-junqueira-tennis' THEN 'nao_confirmada'
        END
        WHERE slug IN (
          'pickleball-point-arena',
          'olimpia-arena-pickleball',
          'reinaldo-junqueira-tennis'
        )
      `)
      .execute();
  });
}, () => {
  // Keep rollback non-destructive: coverage facts are safer to retain than erase.
});
