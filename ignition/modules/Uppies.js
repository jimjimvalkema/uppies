import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Uppies", (m) => {
  const _aavePoolInstance =  m.getParameter("aavePoolInstance");
  console.log({_aavePoolInstance})
  const _aaveOracle =  m.getParameter("aaveOracle");
  const uppies = m.contract("Uppies",[_aavePoolInstance, _aaveOracle]);


  return { uppies };
});
