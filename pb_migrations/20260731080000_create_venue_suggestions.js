/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  app.runInTransaction((txApp) => {
    let venues;
    try {
      venues = txApp.findCollectionByNameOrId("venues");
    } catch {
      throw new Error("A coleção venues é necessária para venue_suggestions.");
    }

    let suggestions;
    let schemaChanged = false;
    try {
      suggestions = txApp.findCollectionByNameOrId("venue_suggestions");
    } catch {
      suggestions = new Collection({
        name: "venue_suggestions",
        type: "base",
      });
      schemaChanged = true;
    }

    suggestions.name = "venue_suggestions";
    suggestions.type = "base";
    if (!Array.isArray(suggestions.fields)) {
      suggestions.fields = [];
      schemaChanged = true;
    }

    const ensureField = (name, create, normalize) => {
      let field = suggestions.fields.find((candidate) => candidate.name === name);
      if (!field) {
        field = create();
        suggestions.fields.push(field);
        schemaChanged = true;
      }
      if (normalize(field)) {
        schemaChanged = true;
      }
    };

    ensureField(
      "kind",
      () => new SelectField({
        name: "kind",
        required: true,
        values: ["nova_quadra", "correcao"],
        maxSelect: 1,
      }),
      (field) => {
        let changed = false;
        if (!field.required) {
          field.required = true;
          changed = true;
        }
        if (field.maxSelect !== 1) {
          field.maxSelect = 1;
          changed = true;
        }
        if (
          !Array.isArray(field.values) ||
          field.values.length !== 2 ||
          field.values[0] !== "nova_quadra" ||
          field.values[1] !== "correcao"
        ) {
          field.values = ["nova_quadra", "correcao"];
          changed = true;
        }
        return changed;
      },
    );

    ensureField(
      "venue",
      () => new RelationField({
        name: "venue",
        collectionId: venues.id,
        required: false,
        maxSelect: 1,
        cascadeDelete: false,
      }),
      (field) => {
        let changed = false;
        if (field.required) {
          field.required = false;
          changed = true;
        }
        if (field.collectionId !== venues.id) {
          field.collectionId = venues.id;
          changed = true;
        }
        if (field.maxSelect !== 1) {
          field.maxSelect = 1;
          changed = true;
        }
        if (field.cascadeDelete) {
          field.cascadeDelete = false;
          changed = true;
        }
        return changed;
      },
    );

    const textFields = [
      ["name", true, 120],
      ["neighborhood", true, 100],
      ["address", false, 180],
      ["contact_or_source", false, 240],
      ["message", false, 600],
    ];
    for (const [name, required, max] of textFields) {
      ensureField(
        name,
        () => new TextField({ name, required, max }),
        (field) => {
          let changed = false;
          if (field.required !== required) {
            field.required = required;
            changed = true;
          }
          if (field.max !== max) {
            field.max = max;
            changed = true;
          }
          return changed;
        },
      );
    }

    ensureField(
      "rate_limit_fingerprint",
      () => new TextField({
        name: "rate_limit_fingerprint",
        required: false,
        hidden: true,
      }),
      (field) => {
        let changed = false;
        if (field.required) {
          field.required = false;
          changed = true;
        }
        if (!field.hidden) {
          field.hidden = true;
          changed = true;
        }
        return changed;
      },
    );

    const ensureAutodate = (name, hidden) => {
      ensureField(
        name,
        () => new AutodateField({
          name,
          hidden,
          onCreate: true,
          onUpdate: false,
        }),
        (field) => {
          let changed = false;
          if (field.hidden !== hidden) {
            field.hidden = hidden;
            changed = true;
          }
          if (field.onCreate !== true) {
            field.onCreate = true;
            changed = true;
          }
          if (field.onUpdate !== false) {
            field.onUpdate = false;
            changed = true;
          }
          return changed;
        },
      );
    };

    ensureAutodate("rate_limit_created_at", true);
    ensureAutodate("created", false);

    if (suggestions.listRule !== null) {
      suggestions.listRule = null;
      schemaChanged = true;
    }
    if (suggestions.viewRule !== null) {
      suggestions.viewRule = null;
      schemaChanged = true;
    }
    if (suggestions.createRule !== "") {
      suggestions.createRule = "";
      schemaChanged = true;
    }
    if (suggestions.updateRule !== null) {
      suggestions.updateRule = null;
      schemaChanged = true;
    }
    if (suggestions.deleteRule !== null) {
      suggestions.deleteRule = null;
      schemaChanged = true;
    }

    const indexes = suggestions.indexes || [];
    if (!indexes.some((index) => index.includes("idx_venue_suggestions_rate_limit"))) {
      indexes.push(
        "CREATE INDEX idx_venue_suggestions_rate_limit ON venue_suggestions (rate_limit_fingerprint, rate_limit_created_at)",
      );
      suggestions.indexes = indexes;
      schemaChanged = true;
    }

    if (schemaChanged) {
      txApp.save(suggestions);
    }
  });
}, () => {
  // Keep rollback non-destructive so submitted suggestions are never removed.
});
