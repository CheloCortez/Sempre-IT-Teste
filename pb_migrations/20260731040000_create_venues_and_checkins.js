/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let venues;

  try {
    venues = app.findCollectionByNameOrId("venues");
  } catch {
    venues = new Collection({
      name: "venues",
      type: "base",
    });
  }

  venues.name = "venues";
  venues.type = "base";
  venues.fields = [
    new TextField({ name: "slug", required: true }),
    new TextField({ name: "name", required: true }),
    new TextField({ name: "neighborhood", required: true }),
    new TextField({ name: "address", required: true }),
    new NumberField({ name: "lat", required: true }),
    new NumberField({ name: "lng", required: true }),
    new NumberField({ name: "courts", required: true }),
    new TextField({ name: "surface", required: true }),
    new BoolField({ name: "indoor", required: true }),
    new TextField({ name: "access_type", required: true }),
    new TextField({ name: "notes_pt", required: true }),
    new TextField({ name: "source_url", required: true }),
    new BoolField({ name: "active", required: true }),
  ];
  venues.listRule = "";
  venues.viewRule = "";
  venues.createRule = null;
  venues.updateRule = null;
  venues.deleteRule = null;

  const venuesIndexes = venues.indexes || [];
  if (!venuesIndexes.some((index) => index.includes("idx_venues_slug"))) {
    venuesIndexes.push("CREATE UNIQUE INDEX idx_venues_slug ON venues (slug)");
  }
  venues.indexes = venuesIndexes;

  app.save(venues);

  let checkins;

  try {
    checkins = app.findCollectionByNameOrId("checkins");
  } catch {
    checkins = new Collection({
      name: "checkins",
      type: "base",
    });
  }

  checkins.name = "checkins";
  checkins.type = "base";
  checkins.fields = [
    new RelationField({
      name: "venue",
      collectionId: venues.id,
      required: true,
      maxSelect: 1,
      cascadeDelete: false,
    }),
    new NumberField({ name: "players_now", required: true }),
    new SelectField({
      name: "crowd_level",
      required: true,
      values: ["vazia", "moderada", "cheia"],
      maxSelect: 1,
    }),
    new SelectField({
      name: "skill_range",
      required: true,
      values: ["iniciante", "intermediario", "avancado", "misto"],
      maxSelect: 1,
    }),
    new NumberField({ name: "wait_minutes" }),
    new TextField({ name: "display_name" }),
    new TextField({ name: "note" }),
  ];
  checkins.listRule = "";
  checkins.viewRule = "";
  checkins.createRule = "";
  checkins.updateRule = null;
  checkins.deleteRule = null;

  return app.save(checkins);
}, (app) => {
  try {
    const checkins = app.findCollectionByNameOrId("checkins");
    app.delete(checkins);
  } catch {}

  try {
    const venues = app.findCollectionByNameOrId("venues");
    return app.delete(venues);
  } catch {}
});
