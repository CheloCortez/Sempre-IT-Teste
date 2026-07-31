/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  app.runInTransaction((txApp) => {
    const venues = txApp.findCollectionByNameOrId("venues");
    const nullableFields = ["courts", "surface", "indoor"];
    let schemaChanged = false;

    // Update only the required flag on the existing fields so existing rules,
    // indexes, field options, and records are preserved.
    for (const fieldName of nullableFields) {
      const field = venues.fields.find((candidate) => candidate.name === fieldName);

      if (!field) {
        throw new Error(`venues collection is missing required field: ${fieldName}`);
      }

      if (field.required) {
        field.required = false;
        schemaChanged = true;
      }
    }

    if (schemaChanged) {
      txApp.save(venues);
    }

    // PocketBase's original required-field columns were created NOT NULL with
    // zero-value defaults. Rebuild only this table so source unknowns remain
    // SQL NULL instead of becoming 0, false, or an empty string. Collection
    // metadata (including rules) stays intact, all rows are copied, and the
    // collection-owned indexes are recreated from their existing definitions.
    txApp
      .db()
      .newQuery(`
        CREATE TABLE venues__nullable_seed (
          access_type TEXT DEFAULT '' NOT NULL,
          active BOOLEAN DEFAULT FALSE NOT NULL,
          address TEXT DEFAULT '' NOT NULL,
          courts NUMERIC DEFAULT NULL,
          id TEXT PRIMARY KEY DEFAULT ('r'||lower(hex(randomblob(7)))) NOT NULL,
          indoor BOOLEAN DEFAULT NULL,
          lat NUMERIC DEFAULT 0 NOT NULL,
          lng NUMERIC DEFAULT 0 NOT NULL,
          name TEXT DEFAULT '' NOT NULL,
          neighborhood TEXT DEFAULT '' NOT NULL,
          notes_pt TEXT DEFAULT '' NOT NULL,
          slug TEXT DEFAULT '' NOT NULL,
          source_url TEXT DEFAULT '' NOT NULL,
          surface TEXT DEFAULT NULL
        )
      `)
      .execute();

    txApp
      .db()
      .newQuery(`
        INSERT INTO venues__nullable_seed (
          access_type,
          active,
          address,
          courts,
          id,
          indoor,
          lat,
          lng,
          name,
          neighborhood,
          notes_pt,
          slug,
          source_url,
          surface
        )
        SELECT
          access_type,
          active,
          address,
          courts,
          id,
          indoor,
          lat,
          lng,
          name,
          neighborhood,
          notes_pt,
          slug,
          source_url,
          surface
        FROM venues
      `)
      .execute();

    txApp.db().newQuery("DROP TABLE venues").execute();
    txApp
      .db()
      .newQuery("ALTER TABLE venues__nullable_seed RENAME TO venues")
      .execute();

    for (const index of venues.indexes || []) {
      txApp.db().newQuery(index).execute();
    }

    // One bulk upsert keeps startup fast and converges safely after a partial
    // application. The fixed record ids are used only for first insert; slug
    // is the durable key.
    txApp
      .db()
      .newQuery(`
        INSERT INTO venues (
          id,
          slug,
          name,
          neighborhood,
          address,
          lat,
          lng,
          courts,
          surface,
          indoor,
          access_type,
          notes_pt,
          source_url,
          active
        ) VALUES
          (
            'pkpointarena001',
            'pickleball-point-arena',
            'Pickleball Point Arena',
            'Chácara Santo Antônio / Brooklin',
            'Rua Antônio de Oliveira, 595, São Paulo - SP, 04718-050',
            -23.6276,
            -46.7043,
            3,
            'hard',
            TRUE,
            'reserva_e_aulas',
            'Arena dedicada com reserva e aulas; página do operador publica R$220/h de locação. Confiança alta.',
            'https://www.pickleballpoint.com.br/',
            TRUE
          ),
          (
            'olimpiaarena001',
            'olimpia-arena-pickleball',
            'Olímpia Arena Pickleball',
            'Vila Olímpia',
            'Rua Quatá, 283, Vila Olímpia, São Paulo - SP, 04546-042',
            -23.599044,
            -46.676469,
            2,
            'oficial_nao_especificada',
            NULL,
            'locacao_e_aulas',
            'Duas quadras oficiais; fontes divergem sobre cobertura, então indoor permanece nulo. Confiança alta.',
            'https://www.olimpiapickleball.com.br/',
            TRUE
          ),
          (
            'rjtennisvenue01',
            'reinaldo-junqueira-tennis',
            'Reinaldo Junqueira Tennis',
            'Vila Cordeiro',
            'Rua Francisco Dias Velho, 1033, Vila Cordeiro, São Paulo - SP, 04581-001',
            -23.616078,
            -46.692154,
            NULL,
            NULL,
            NULL,
            'locacao_por_hora',
            'Listagem pública e matéria de 2023 confirmam pickleball/locação; revalidar estrutura e preço. Confiança média.',
            'https://masasports.com.br/pages/quadras-de-pickleball',
            TRUE
          )
        ON CONFLICT(slug) DO UPDATE SET
          name = excluded.name,
          neighborhood = excluded.neighborhood,
          address = excluded.address,
          lat = excluded.lat,
          lng = excluded.lng,
          courts = excluded.courts,
          surface = excluded.surface,
          indoor = excluded.indoor,
          access_type = excluded.access_type,
          notes_pt = excluded.notes_pt,
          source_url = excluded.source_url,
          active = excluded.active
      `)
      .execute();
  });
}, () => {
  // Keep rollback non-destructive: existing live records may contain NULL values.
});
