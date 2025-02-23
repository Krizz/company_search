const fastify = require("fastify")({
  logger: true,
});
const axios = require("axios");
const unzip = require("unzipper");
const { parse } = require("csv-parse");
const { Index } = require("flexsearch");

const companies = new Map();
const index = new Index({
  preset: "memory",
  threshold: 8,
  resolution: 9,
  depth: 1,
  async: false,
  worker: false,
  cache: true,
});

const DATASET_URL = `https://avaandmed.ariregister.rik.ee/sites/default/files/avaandmed/ettevotja_rekvisiidid__lihtandmed.csv.zip`;

const TRANSLATIONS = {
  nimi: "name",
  ariregistri_kood: "registration_code",
  ettevotja_oiguslik_vorm: "legal_form_of_entrepreneur",
  ettevotja_oigusliku_vormi_alaliik: "subtype_of_legal_form",
  kmkr_nr: "vat_number",
  ettevotja_staatus: "entrepreneur_status",
  ettevotja_staatus_tekstina: "entrepreneur_status_as_text",
  ettevotja_esmakande_kpv: "first_registration_date",
  ettevotja_aadress: "entrepreneur_address",
  asukoht_ettevotja_aadressis: "location_of_entrepreneur_address",
  asukoha_ehak_kood: "location_ehak_code",
  asukoha_ehak_tekstina: "location_ehak_text",
  indeks_ettevotja_aadressis: "address_index",
  ads_adr_id: "ads_address_id",
  ads_ads_oid: "ads_address_oid",
  ads_normaliseeritud_taisaadress: "ads_normalized_full_address",
  teabesysteemi_link: "information_system_link",
};

const generateIndex = async () => {
  console.log("Downloading...");
  //return;
  const response = await axios({
    url: DATASET_URL,
    method: "get",
    responseType: "stream",
  });

  console.log("Indexing...");
  let total = 0;
  response.data
    .pipe(unzip.Parse())
    .on("entry", (entry) => {
      const filePath = entry.path;

      if (filePath.startsWith("ettevotja_rekvisiidid")) {
        const parser = parse({
          delimiter: ";",
          columns: true,
          bom: true,
        });
        entry.pipe(parser).on("data", (d) => {
          const translatedItem = Object.keys(d).reduce((acc, key) => {
            const translatedKey = TRANSLATIONS[key];
            if (translatedKey) {
              acc[translatedKey] = d[key];
            }
            return acc;
          }, {});

          index.add(translatedItem.registration_code, translatedItem.name);
          companies.set(translatedItem.registration_code, {
            ...translatedItem,
            original_data: d,
          });

          total++;
          if (total % 10000 === 0) {
            console.log(`Indexed ${total} companies`);
          }
        });
      } else {
        entry.autodrain();
      }
    })
    .on("finish", async () => {
      const result = await index.search(`Super`);
      console.log(result);
      console.log("Index created");
    });
};

fastify
  .get("/", async (request, reply) => {
    return { ok: 1 };
  })
  .get("/company/:code", async (request, reply) => {
    const { code } = request.params;
    return { ok: 1, data: companies.get(code) };
  })
  .get("/search", async (request, reply) => {
    const { q: query } = request.query;

    const data = await index.search(query, {
      suggest: true,
      limit: 100,
    });
    const results = data.map((id) => companies.get(id));

    return { ok: 1, data: results };
  });

const start = async () => {
  await fastify.listen({
    port: process.env.PORT || 80,
    host: "0.0.0.0",
  });
};

start();

setInterval(() => {
  generateIndex();
}, 1000 * 60 * 60 * 24);

generateIndex();
