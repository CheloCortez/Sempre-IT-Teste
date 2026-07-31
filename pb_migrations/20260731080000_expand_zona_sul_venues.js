/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  app.runInTransaction((txApp) => {
    const venues = txApp.findCollectionByNameOrId("venues");
    let schemaChanged = false;
    let coverageStatus = venues.fields.find(
      (field) => field.name === "coverage_status",
    );

    // Preserve the collection's existing fields, indexes, and rules. This
    // migration only ensures this API-readable field is optional and visible.
    if (!coverageStatus) {
      coverageStatus = new TextField({
        name: "coverage_status",
        required: false,
        hidden: false,
      });
      venues.fields.push(coverageStatus);
      schemaChanged = true;
    } else {
      if (coverageStatus.required !== false) {
        coverageStatus.required = false;
        schemaChanged = true;
      }
      if (coverageStatus.hidden !== false) {
        coverageStatus.hidden = false;
        schemaChanged = true;
      }
    }

    if (schemaChanged) {
      txApp.save(venues);
    }

    const venueRows = [
      {
        slug: "pickleball-point-arena",
        name: "Pickleball Point Arena",
        neighborhood: "Chácara Santo Antônio / Brooklin",
        address: "Rua Antônio de Oliveira, 595, São Paulo - SP, 04718-050",
        lat: -23.6276,
        lng: -46.7043,
        courts: 3,
        surface: "hard",
        indoor: true,
        access_type: "reserva_e_aulas",
        notes_pt:
          "Arena dedicada com reserva e aulas; o site do operador informa três quadras cobertas. Fonte pública do operador.",
        source_url: "https://www.pickleballpoint.com.br/",
        active: true,
        coverage_status: "coberta",
      },
      {
        slug: "olimpia-arena-pickleball",
        name: "Olímpia Arena Pickleball",
        neighborhood: "Vila Olímpia",
        address: "R. Quatá, 283, Vila Olímpia, São Paulo - SP, 04546-042",
        lat: -23.599,
        lng: -46.6765,
        courts: 2,
        surface: "oficial_nao_especificada",
        indoor: null,
        access_type: "locacao_e_aulas",
        notes_pt:
          "O site do operador confirma duas quadras oficiais: uma coberta e uma descoberta. A cobertura é parcial; indoor permanece não especificado para o local.",
        source_url: "https://www.olimpiapickleball.com.br/",
        active: true,
        coverage_status: "coberta",
      },
      {
        slug: "reinaldo-junqueira-tennis",
        name: "Academia Reinaldo Junqueira",
        neighborhood: "Vila Cordeiro",
        address:
          "Rua Francisco Dias Velho, 1033, Vila Cordeiro, São Paulo - SP, 04581-001",
        lat: -23.616078,
        lng: -46.692154,
        courts: null,
        surface: null,
        indoor: null,
        access_type: "aulas",
        notes_pt:
          "A matéria pública da VEJA São Paulo cita a Academia Reinaldo Junqueira entre os locais de pickleball. A fonte não informa cobertura, número de quadras ou piso.",
        source_url:
          "https://vejasp.abril.com.br/cultura-lazer/pickleball-esporte-sao-paulo/",
        active: true,
        coverage_status: "nao_confirmada",
      },
      {
        slug: "pickleball-bola-furada",
        name: "Pickleball Bola Furada",
        neighborhood: "Santo Amaro / Alto da Boa Vista",
        address: "Rua São Benedito, 1924, Santo Amaro, São Paulo - SP, 04735-004",
        lat: -23.6385,
        lng: -46.6943,
        courts: null,
        surface: null,
        indoor: null,
        access_type: "aulas",
        notes_pt:
          "Diretório público registra aulas de pickleball neste endereço; cobertura, piso e quantidade de quadras não estão informados.",
        source_url:
          "https://ondejogarpickleball.com.br/quadras-de-pickleball/pickleball-bola-furada",
        active: true,
        coverage_status: "nao_confirmada",
      },
      {
        slug: "catita-beach-academy",
        name: "Catita Beach Academy",
        neighborhood: "Indianópolis / Moema",
        address: "Alameda Iraé, 37, Indianópolis, São Paulo - SP, 04075-000",
        lat: -23.6002799,
        lng: -46.6573991,
        courts: null,
        surface: null,
        indoor: null,
        access_type: "nao_especificado",
        notes_pt:
          "Listagem pública da JOOLA inclui a Catita Beach Academy como local de pickleball. A fonte não detalha infraestrutura ou modalidade de acesso.",
        source_url: "https://www.joola.com.br/en/blogs/news/onde-jogar-pickleball",
        active: true,
        coverage_status: "nao_confirmada",
      },
      {
        slug: "the-corner-wellness",
        name: "The Corner Wellness",
        neighborhood: "Vila Nova Conceição",
        address:
          "Rua Escobar Ortiz, 730 A, Vila Nova Conceição, São Paulo - SP, 04512-052",
        lat: -23.5924235,
        lng: -46.6668366,
        courts: null,
        surface: null,
        indoor: null,
        access_type: "membros_e_aulas",
        notes_pt:
          "Diretório público lista o The Corner entre os locais de pickleball. A fonte não informa cobertura, piso ou número de quadras; confirme condições de acesso com o espaço.",
        source_url: "https://masasports.com.br/pages/quadras-de-pickleball",
        active: true,
        coverage_status: "nao_confirmada",
      },
      {
        slug: "tennis-experience-brooklin",
        name: "Tennis Experience",
        neighborhood: "Brooklin / Cidade Monções",
        address:
          "Terraço Plaza Centenário, Rua Flórida, 1970, 5º andar, São Paulo - SP, 04565-907",
        lat: -23.6067099,
        lng: -46.695735,
        courts: 1,
        surface: null,
        indoor: null,
        access_type: "aulas",
        notes_pt:
          "O operador oferece aulas individuais e em grupo de pickleball e informa uma quadra Tennis Kids / Pickleball. Cobertura e piso não são especificados.",
        source_url: "https://tennisexperience.com.br/pickleball/",
        active: true,
        coverage_status: "nao_confirmada",
      },
      {
        slug: "pickleball-no-ibira",
        name: "Pickleball no Ibira",
        neighborhood: "Vila Mariana / Ibirapuera",
        address: "Parque Ibirapuera, Vila Mariana, São Paulo - SP, 04094-000",
        lat: -23.59,
        lng: -46.6591,
        courts: null,
        surface: null,
        indoor: null,
        access_type: "publica_e_aulas",
        notes_pt:
          "Diretório público registra aulas no Parque Ibirapuera, de segunda a sábado pela manhã. Local ao ar livre; confirme a quadra e os horários antes de sair.",
        source_url:
          "https://ondejogarpickleball.com.br/quadras-de-pickleball/pickleball-no-ibira",
        active: true,
        coverage_status: "aberta",
      },
      {
        slug: "pickleball-praca-rosa-alves",
        name: "Pickleball na Praça Rosa Alves",
        neighborhood: "Vila Mariana",
        address:
          "Praça Rosa Alves da Silva, Vila Mariana, São Paulo - SP, 04106-011",
        lat: -23.5797,
        lng: -46.6325,
        courts: 2,
        surface: "hard",
        indoor: false,
        access_type: "publica_e_aulas",
        notes_pt:
          "A VEJA São Paulo registrou duas quadras autorizadas na praça; diretório público lista horários de aulas. Quadras abertas em espaço público.",
        source_url:
          "https://ondejogarpickleball.com.br/quadras-de-pickleball/pickleball-na-praca-rosa-alves",
        active: true,
        coverage_status: "aberta",
      },
      {
        slug: "gsta-ii",
        name: "GSTA II",
        neighborhood: "Jardim Cordeiro / Campo Belo",
        address:
          "Av. Professor Rubens Gomes de Souza, 1140, Jardim Cordeiro, São Paulo - SP, 04640-230",
        lat: -23.6385949,
        lng: -46.674873,
        courts: null,
        surface: null,
        indoor: null,
        access_type: "nao_especificado",
        notes_pt:
          "Listagem pública da JOOLA inclui GSTA II como local de pickleball. Não há dados públicos suficientes sobre cobertura, piso, quantidade de quadras ou acesso.",
        source_url: "https://www.joola.com.br/en/blogs/news/onde-jogar-pickleball",
        active: true,
        coverage_status: "nao_confirmada",
      },
      {
        slug: "marino-squash-augusta",
        name: "Marino Squash — Unidade Augusta",
        neighborhood: "Cerqueira César / Jardins",
        address: "Rua Augusta, 2333, Cerqueira César, São Paulo - SP, 01413-000",
        lat: -23.5621032,
        lng: -46.6642751,
        courts: null,
        surface: null,
        indoor: null,
        access_type: "aulas",
        notes_pt:
          "O site da Marino Squash oferece aulas de pickleball; o endereço da unidade Augusta é publicado na página de contato. Cobertura, piso e número de quadras não são especificados.",
        source_url: "https://pickleball.marinosquash.com.br/",
        active: true,
        coverage_status: "nao_confirmada",
      },
      {
        slug: "arena-club-racket",
        name: "Arena Club Racket",
        neighborhood: "Jardim da Saúde",
        address:
          "Rua Pierre Curie, 286, Jardim da Saúde, São Paulo - SP, 04290-050",
        lat: -23.61665,
        lng: -46.6155018,
        courts: null,
        surface: null,
        indoor: null,
        access_type: "nao_especificado",
        notes_pt:
          "Diretório público de pickleball lista a Arena Club Racket neste endereço. Cobertura, piso, número de quadras e acesso não são especificados na fonte.",
        source_url:
          "https://pickleball.net.br/pages/quadras-de-pickleball-brasil",
        active: true,
        coverage_status: "nao_confirmada",
      },
    ];
    const columns = [
      "slug",
      "name",
      "neighborhood",
      "address",
      "lat",
      "lng",
      "courts",
      "surface",
      "indoor",
      "access_type",
      "notes_pt",
      "source_url",
      "active",
      "coverage_status",
    ];
    const params = {};
    const values = venueRows
      .map((venue, rowIndex) => {
        const placeholders = columns.map((column) => {
          const parameter = `${column}_${rowIndex}`;
          params[parameter] = venue[column];
          return `{:${parameter}}`;
        });

        return `(${placeholders.join(", ")})`;
      })
      .join(", ");

    // One parameterized bulk upsert preserves existing ids (and thus check-in
    // relations), while letting SQLite generate ids for newly inserted venues.
    txApp
      .db()
      .newQuery(`
        INSERT INTO venues (${columns.join(", ")})
        VALUES ${values}
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
          active = excluded.active,
          coverage_status = excluded.coverage_status
      `)
      .bind(params)
      .execute();
  });
}, () => {
  // Keep rollback non-destructive: venue records and check-ins remain intact.
});
