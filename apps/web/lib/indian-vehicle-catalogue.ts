import type { VehicleFuelType, VehicleTransmission } from "@dvcs/types";

export type DefaultVehicleModel = {
  make: string;
  model: string;
  bodyType: string;
  fuelTypes: VehicleFuelType[];
  transmissions: VehicleTransmission[];
};

const manual: VehicleTransmission[] = ["manual", "automatic"];

export const indianVehicleCatalogue: DefaultVehicleModel[] = [
  ...models("Maruti Suzuki", "Hatchback", ["petrol", "cng", "petrol_cng"], ["Alto K10", "S-Presso", "Celerio", "WagonR", "Swift", "Baleno"]),
  ...models("Maruti Suzuki", "Sedan", ["petrol", "cng", "petrol_cng"], ["Dzire", "Ciaz"]),
  ...models("Maruti Suzuki", "SUV", ["petrol", "cng", "petrol_cng", "hybrid"], ["Fronx", "Brezza", "Jimny", "Grand Vitara"]),
  ...models("Maruti Suzuki", "MPV", ["petrol", "cng", "petrol_cng", "hybrid"], ["Ertiga", "XL6", "Invicto"]),
  ...models("Hyundai", "Hatchback", ["petrol", "cng", "petrol_cng"], ["Grand i10 Nios", "i20"]),
  ...models("Hyundai", "Sedan", ["petrol", "cng", "petrol_cng", "diesel"], ["Aura", "Verna"]),
  ...models("Hyundai", "SUV", ["petrol", "diesel", "electric"], ["Exter", "Venue", "Creta", "Alcazar", "Tucson", "Ioniq 5"]),
  ...models("Tata", "Hatchback", ["petrol", "cng", "petrol_cng", "electric"], ["Tiago", "Altroz"]),
  ...models("Tata", "Sedan", ["petrol", "cng", "petrol_cng", "electric"], ["Tigor"]),
  ...models("Tata", "SUV", ["petrol", "diesel", "cng", "petrol_cng", "electric"], ["Punch", "Nexon", "Curvv", "Harrier", "Safari"]),
  ...models("Mahindra", "SUV", ["petrol", "diesel", "electric"], ["XUV 3XO", "Bolero", "Bolero Neo", "Thar", "Thar Roxx", "Scorpio Classic", "Scorpio-N", "XUV700", "BE 6", "XEV 9e"]),
  ...models("Toyota", "Hatchback", ["petrol"], ["Glanza"]),
  ...models("Toyota", "Sedan", ["petrol", "hybrid"], ["Camry"]),
  ...models("Toyota", "SUV", ["petrol", "diesel", "hybrid"], ["Urban Cruiser Taisor", "Urban Cruiser Hyryder", "Fortuner", "Land Cruiser 300"]),
  ...models("Toyota", "MPV", ["petrol", "diesel", "hybrid"], ["Rumion", "Innova Crysta", "Innova Hycross", "Vellfire"]),
  ...models("Kia", "SUV", ["petrol", "diesel", "electric"], ["Sonet", "Seltos", "Syros", "EV6", "EV9"]),
  ...models("Kia", "MPV", ["petrol", "diesel"], ["Carens", "Carnival"]),
  ...models("Honda", "Sedan", ["petrol", "hybrid"], ["Amaze", "City"]),
  ...models("Honda", "SUV", ["petrol"], ["Elevate"]),
  ...models("Renault", "Hatchback", ["petrol"], ["Kwid"]),
  ...models("Renault", "SUV", ["petrol"], ["Kiger"]),
  ...models("Renault", "MPV", ["petrol"], ["Triber"]),
  ...models("Nissan", "SUV", ["petrol"], ["Magnite", "X-Trail"]),
  ...models("MG", "SUV", ["petrol", "diesel", "electric"], ["Astor", "Hector", "Hector Plus", "Gloster", "ZS EV", "Windsor EV"]),
  ...models("Skoda", "Sedan", ["petrol"], ["Slavia", "Superb"]),
  ...models("Skoda", "SUV", ["petrol"], ["Kylaq", "Kushaq", "Kodiaq"]),
  ...models("Volkswagen", "Sedan", ["petrol"], ["Virtus"]),
  ...models("Volkswagen", "SUV", ["petrol"], ["Taigun", "Tiguan"]),
  ...models("Jeep", "SUV", ["petrol", "diesel"], ["Compass", "Meridian", "Wrangler", "Grand Cherokee"]),
  ...models("Citroën", "Hatchback", ["petrol", "electric"], ["C3", "eC3"]),
  ...models("Citroën", "SUV", ["petrol"], ["Aircross", "C5 Aircross"]),
  ...models("Force Motors", "SUV", ["diesel"], ["Gurkha"]),
  ...models("Force Motors", "Van", ["diesel"], ["Traveller", "Urbania"]),
  ...models("Isuzu", "Pickup", ["diesel"], ["D-Max", "V-Cross", "S-CAB"]),
  ...models("Isuzu", "SUV", ["diesel"], ["MU-X"]),
];

function models(make: string, bodyType: string, fuelTypes: VehicleFuelType[], names: string[]): DefaultVehicleModel[] {
  return names.map((model) => ({ make, model, bodyType, fuelTypes, transmissions: manual }));
}

export const defaultVehicleMakes = [...new Set(indianVehicleCatalogue.map(({ make }) => make))].sort();

export function defaultModelsForMake(make: string) {
  return indianVehicleCatalogue.filter((entry) => entry.make === make);
}
