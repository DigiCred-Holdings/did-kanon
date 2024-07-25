// SQL: new SQLWalletModule(),
import type {
  InitConfig,
  Key,
  OfferCredentialOptions,
  Routing,
} from "@credo-ts/core";
import express from "express";
import {
  HttpOutboundTransport,
  Agent,
  LogLevel,
  WsOutboundTransport,
  ConsoleLogger,
  MediationRecipientModule,
  DidsModule,
  DidCommV1Service,
  AutoAcceptCredential,
  CredentialsModule,
  V2CredentialProtocol,
} from "@credo-ts/core";
import { agentDependencies, HttpInboundTransport } from "@credo-ts/node";
import { SQLWalletModule } from "./wallet/SQLWalletModule";
import { EthereumModule } from "./kanon/KanonModule";
import { KanonDIDRegistrar, KanonDIDResolver } from "./kanon/dids";
import { EthereumLedgerService } from "./kanon/ledger";
import { KanonModuleConfig } from "./kanon/KanonModuleConfig";
import { AskarModule } from "@credo-ts/askar";
import { ariesAskar } from "@hyperledger/aries-askar-nodejs";
import { anoncreds } from "@hyperledger/anoncreds-nodejs";
import {
  AnonCredsCredentialFormatService,
  AnonCredsModule,
} from "@credo-ts/anoncreds";
import { KanonAnonCredsRegistry } from "./kanon/anoncreds";

const app = express();
async function run() {
  const ethConfig = new KanonModuleConfig({
    networks: [
      {
        network: "mainnet",
        rpcUrl: "https://mainnet.infura.io/v3/YOUR",
        privateKey:
          "",
      },
    ],
  });
  const name = "alssasdddxxe";
  const agentConfig: InitConfig = {
    label: `Credo ${name}`,
    walletConfig: {
      id: name,
      key: name,
    },
    logger: new ConsoleLogger(LogLevel.off),
    endpoints: ["http://localhost:3001"],
  };
  const ledgerService = new EthereumLedgerService(ethConfig);
  const alice = new Agent({
    config: agentConfig,
    dependencies: agentDependencies,
    modules: {
      dids: new DidsModule({
        registrars: [new KanonDIDRegistrar(ledgerService)],
        resolvers: [new KanonDIDResolver(ledgerService)],
      }),
      SQL: new SQLWalletModule(),
      kanon: new EthereumModule({
        networks: [
          {
            network: "mainnet",
            privateKey:
              "",
            rpcUrl: "https://eth-sepolia-public.unifra.io",
          },
        ],
      }),
      anoncreds: new AnonCredsModule({
        registries: [new KanonAnonCredsRegistry()],
        anoncreds: anoncreds,
      }),

      credentials: new CredentialsModule({
        credentialProtocols: [
          new V2CredentialProtocol({
            credentialFormats: [new AnonCredsCredentialFormatService()],
          }),
        ],
      }),
    },
  });
  const holder = new Agent({
    config: {
      label: "holder",
      walletConfig: {
        id: "holder",
        key: "holder",
      },
      logger: new ConsoleLogger(LogLevel.off),
      endpoints: ["http://localhost:3002"],
    },
    dependencies: agentDependencies,
    modules: {
      askar: new AskarModule({
        ariesAskar,
      }),
      anoncreds: new AnonCredsModule({
        registries: [new KanonAnonCredsRegistry()],
        anoncreds,
      }),
      dids: new DidsModule({
        resolvers: [new KanonDIDResolver(ledgerService)],
      }),
      credentials: new CredentialsModule({
        credentialProtocols: [
          new V2CredentialProtocol({
            credentialFormats: [new AnonCredsCredentialFormatService()],
          }),
        ],
      }),
    },
  });

  alice.registerOutboundTransport(new HttpOutboundTransport());
  alice.registerOutboundTransport(new WsOutboundTransport());
  alice.registerInboundTransport(new HttpInboundTransport({ port: 3001 }));
  holder.registerOutboundTransport(new HttpOutboundTransport());
  holder.registerOutboundTransport(new WsOutboundTransport());
  holder.registerInboundTransport(new HttpInboundTransport({ port: 3002 }));
  await holder.initialize();

  await alice.initialize();
  // console.log(JSON.stringify(dids), "dids");
  // const did = await alice.dids.create({
  //   network: "Mainnet",
  //   method: "kanon",

  //   options: {
  //     didDocument: {
  //       context: "https://www.w3.org/ns/did/v1",
  //       recipientKeys: ["did:kanon:0xsey-1"],
  //       service: [
  //         new DidCommV1Service({
  //           id: "did:kanon",
  //           serviceEndpoint: "https://didcommv1.com",
  //           recipientKeys: ["did:kanon:0xsd#key-1"],
  //         }),
  //       ],
  //     },
  //   },
  // });

  console.log(alice.modules.anoncreds.registerCredentialDefinition.toString());
  const schema = await alice.modules.anoncreds.registerSchema({
    options: {},
    schema: {
      name: "schema",
      version: "1.0",
      attrNames: ["name"],
      issuerId: "did:kanon:Mainnet:557d47de-a250-4d5b-a1f7-92399dac2432",
    },
  });
  console.log(schema, "schema");
  // create credential definition

  // wait for 20 seconds
  // await new Promise((resolve) => setTimeout(resolve, 10000));
  const credDef = await alice.modules.anoncreds.registerCredentialDefinition({
    credentialDefinition: {
      schemaId: schema.schemaState.schemaId!,
      issuerId: "did:kanon:Mainnet:557d47de-a250-4d5b-a1f7-92399dac2432",
      tag: "tag",
    },
    options: {
      supportRevocation: false,
    },
  });
  console.log(credDef, "credDef");
  // await new Promise((resolve) => setTimeout(resolve, 10000));
  const credDefId = credDef.credentialDefinitionState.credentialDefinitionId!;
  // connect to holder
  console.log(credDefId, "credDefId");
  const invitation = await holder.oob.createInvitation({
    autoAcceptConnection: true,
  });
  const invitationUrl = invitation.outOfBandInvitation.toUrl({
    domain: "localhost:3002",
  });

  const connection = await alice.oob.receiveInvitationFromUrl(invitationUrl);
  console.log(connection.connectionRecord?.id, "connection");
  // wait 2  seconds
  await new Promise((resolve) => setTimeout(resolve, 10000));
  // get connection state
  const state = await alice.connections.findById(
    connection.connectionRecord!.id
  );
  console.log(state, "state");
  const credDefs =
    await alice.modules.anoncreds.getCreatedCredentialDefinitions({});
  console.log(credDefs, "credDefs");
  const cred = await alice.credentials.offerCredential({
    protocolVersion: "v2",
    connectionId: connection.connectionRecord!.id,
    credentialFormats: {
      anoncreds: {
        credentialDefinitionId: credDefId,
        attributes: [{ name: "name", value: "Jane Doe" }],
      },
    },
    autoAcceptCredential: AutoAcceptCredential.Always,
    comment: "comment",
  });
  console.log(cred, "credDef");
}
try {
  void run();
  app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });
} catch (e) {
  void run();
}
