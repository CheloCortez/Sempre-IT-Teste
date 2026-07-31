/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  app.runInTransaction((txApp) => {
    let checkins;

    try {
      checkins = txApp.findCollectionByNameOrId("checkins");
    } catch {
      // The base migration has not created this collection yet, so there is
      // nothing safe to alter here.
      return;
    }

    let schemaChanged = false;

    // Be defensive when this runs against a partially initialized collection.
    if (!Array.isArray(checkins.fields)) {
      checkins.fields = [];
      schemaChanged = true;
    }

    let fingerprint = checkins.fields.find(
      (field) => field.name === "rate_limit_fingerprint",
    );
    if (!fingerprint) {
      fingerprint = new TextField({
        name: "rate_limit_fingerprint",
        required: false,
        hidden: true,
      });
      checkins.fields.push(fingerprint);
      schemaChanged = true;
    } else {
      if (fingerprint.required) {
        fingerprint.required = false;
        schemaChanged = true;
      }
      if (!fingerprint.hidden) {
        fingerprint.hidden = true;
        schemaChanged = true;
      }
    }

    // `created` was omitted from the original collection schema. Keep an
    // existing field in place (and therefore retain its stored values), but
    // normalize its automatic-date settings and public visibility so list and
    // view API responses can be sorted and aggregated by creation time.
    let created = checkins.fields.find((field) => field.name === "created");
    if (!created) {
      created = new AutodateField({
        name: "created",
        hidden: false,
        onCreate: true,
        onUpdate: false,
      });
      checkins.fields.push(created);
      schemaChanged = true;
    } else {
      if (created.hidden !== false) {
        created.hidden = false;
        schemaChanged = true;
      }
      if (created.onCreate !== true) {
        created.onCreate = true;
        schemaChanged = true;
      }
      if (created.onUpdate !== false) {
        created.onUpdate = false;
        schemaChanged = true;
      }
    }

    let rateLimitCreatedAt = checkins.fields.find(
      (field) => field.name === "rate_limit_created_at",
    );
    if (!rateLimitCreatedAt) {
      rateLimitCreatedAt = new AutodateField({
        name: "rate_limit_created_at",
        hidden: true,
        onCreate: true,
        onUpdate: false,
      });
      checkins.fields.push(rateLimitCreatedAt);
      schemaChanged = true;
    } else {
      if (!rateLimitCreatedAt.hidden) {
        rateLimitCreatedAt.hidden = true;
        schemaChanged = true;
      }
      if (!rateLimitCreatedAt.onCreate) {
        rateLimitCreatedAt.onCreate = true;
        schemaChanged = true;
      }
      if (rateLimitCreatedAt.onUpdate) {
        rateLimitCreatedAt.onUpdate = false;
        schemaChanged = true;
      }
    }

    const playersNow = checkins.fields.find(
      (field) => field.name === "players_now",
    );
    if (playersNow) {
      if (!playersNow.required) {
        playersNow.required = true;
        schemaChanged = true;
      }
      if (playersNow.min !== 0) {
        playersNow.min = 0;
        schemaChanged = true;
      }
      if (playersNow.max !== 100) {
        playersNow.max = 100;
        schemaChanged = true;
      }
    }

    const waitMinutes = checkins.fields.find(
      (field) => field.name === "wait_minutes",
    );
    if (waitMinutes) {
      if (waitMinutes.required) {
        waitMinutes.required = false;
        schemaChanged = true;
      }
      if (waitMinutes.min !== 0) {
        waitMinutes.min = 0;
        schemaChanged = true;
      }
      if (waitMinutes.max !== 240) {
        waitMinutes.max = 240;
        schemaChanged = true;
      }
    }

    const displayName = checkins.fields.find(
      (field) => field.name === "display_name",
    );
    if (displayName) {
      if (displayName.required) {
        displayName.required = false;
        schemaChanged = true;
      }
      if (displayName.max !== 60) {
        displayName.max = 60;
        schemaChanged = true;
      }
    }

    const note = checkins.fields.find((field) => field.name === "note");
    if (note) {
      if (note.required) {
        note.required = false;
        schemaChanged = true;
      }
      if (note.max !== 280) {
        note.max = 280;
        schemaChanged = true;
      }
    }

    const indexes = checkins.indexes || [];
    if (!indexes.some((index) => index.includes("idx_checkins_rate_limit"))) {
      indexes.push(
        "CREATE INDEX idx_checkins_rate_limit ON checkins (venue, rate_limit_fingerprint, rate_limit_created_at)",
      );
      checkins.indexes = indexes;
      schemaChanged = true;
    }

    if (schemaChanged) {
      txApp.save(checkins);
    }
  });
}, () => {
  // Keep rollback non-destructive so existing anonymous check-ins remain intact.
});
