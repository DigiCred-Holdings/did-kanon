import { ethers } from "ethers";
import { DidDocument, inject, injectable, Logger } from "@credo-ts/core";
import { KanonModuleConfig } from "../KanonModuleConfig";
import { Schema } from "@hyperledger/anoncreds-nodejs";

export interface IEthereumLedgerConfig {
  network: string;
  providerUrl: string;
  privateKey: string;
}

export enum DefaultProviderUrl {
  mainnet = "https://eth-sepolia-public.unifra.io",
  sepolia = "https://eth-sepolia-public.unifra.io",
}

@injectable()
export class EthereumLedgerService {
  private networks: IEthereumLedgerConfig[];
  private contractAddress: string =
    "0xdFd5668c807F831e2891F8C190Fb712B2Db27eA3";
  private abi: any[] = [
    "function registerDID (string _did, string _context, string _metadata)",
    "function getDID (string _did) view returns (string, string)",
    "function registerSchema (string _schemaId, string _details)",
    "function addApprovedIssuer (string _schemaId, address _issuer)",
    "function getSchema (string _schemaId) view returns (string, address[])",
    "function registerCredentialDefinition (string _credDefId, string _schemaId, address _issuer)",
    "function getCredentialDefinition (string _credDefId) view returns (string, address)",
    "function issueCredential (string _credId, string _credDefId, string _issuer, string _subject, string _issuanceDate, string _expiryDate, string _metadata)",
    "function revokeCredential (string _credId)",
    "function isCredentialRevoked (string _credId) view returns (bool)",
    "function createDID (string _did, bytes32 _didDoc)",
    "function updateDID (string _did, bytes32 _didDoc)",
    "function deactivateDID (string _did)",
    "function getDIDDocument (string _did) view returns (string)",
  ];

  public constructor(config: KanonModuleConfig) {
    this.networks = config.networks.map((config) => {
      const { network, rpcUrl, privateKey } = config;
      return {
        network,
        providerUrl: rpcUrl
          ? rpcUrl
          : network === "mainnet"
          ? DefaultProviderUrl.mainnet
          : DefaultProviderUrl.sepolia,
        privateKey,
      };
    });
  }

  private async getProviderAndSigner(networkName: string): Promise<{
    provider: ethers.JsonRpcProvider;
    signer: ethers.Wallet;
  }> {
    const network = this.networks.find((n) => n.network === networkName);
    if (!network) {
      throw new Error(`Network configuration for ${networkName} not found.`);
    }
    const provider = new ethers.JsonRpcProvider(network.providerUrl);
    const signer = new ethers.Wallet(network.privateKey, provider);
    return { provider, signer };
  }

  public async executeDIDOperation(
    operation: "create" | "update" | "deactivate",
    identifier: string,
    networkName: string,
    didDoc: string,
    metadata?: string
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );

    let transactionResponse;

    switch (operation) {
      case "create":
        console.log("Creating DID", identifier, didDoc, metadata);
        transactionResponse = await contract.registerDID(
          identifier,
          didDoc,
          metadata || ""
        );
        break;
      case "update":
        transactionResponse = await contract.updateDID(
          identifier,
          didDoc,
          metadata || ""
        );
        break;
      case "deactivate":
        transactionResponse = await contract.deactivateDID(identifier);
        break;
      default:
        throw new Error(`Invalid operation: ${operation}`);
    }
    return transactionResponse.wait(); // wait for the transaction to be mined
  }

  async getDIDDocument(
    did: string,
    networkName: string = "mainnet"
  ): Promise<DidDocument | undefined> {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    const document = await contract.getDID(did);
    if (!document) {
      return undefined;
    }
    console.log(document);
    const didDoc = document[0];
    const metadata = document[1];
    let didDocument: DidDocument;

    if (didDoc) {
      const json = JSON.parse(didDoc);
      didDocument = new DidDocument({
        id: did,
        context: json.context,
        service: json.service,
      });
    } else {
      didDocument = new DidDocument({
        id: did,
        context: "",
        service: [],
      });
    }

    if (metadata !== "") {
    }

    return didDocument;
  }

  async getSchema(schemaId: string, networkName: string = "mainnet") {
    console.log(schemaId, "schemaId");
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    const response = await contract.getSchema(schemaId);
    console.log(response, "response");
    try {
      const Json = JSON.parse(response[0]);

      return {
        schema: {
          attrNames: Json.data.attrNames,
          name: Json.name,
          version: Json.data.version,
          issuerId: Json.data.issuerId,
        },
        schemaId,
        resolutionMetadata: {},
        schemaMetadata: {},
      };
    } catch (e) {
      return {
        schema: {
          attrNames: [],
          name: "",
          version: "",
          issuerId: "",
        },
        schemaId,
        resolutionMetadata: {},
        schemaMetadata: {},
      };
    }
  }

  async registerSchema(
    schemaId: string,
    details: string,
    networkName: string = "mainnet"
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    console.log("Registering schema", schemaId, details);
    const tx = await contract.registerSchema(schemaId, details);
    await tx.wait();
    return tx;
  }

  async addApprovedIssuer(
    schemaId: string,
    issuer: string,
    networkName: string = "mainnet"
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    return await contract.addApprovedIssuer(schemaId, issuer);
  }

  async registerCredentialDefinition(
    credDefId: string,
    schemaId: string,
    issuer: string,
    networkName: string = "mainnet"
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    const tx = await contract.registerCredentialDefinition(
      credDefId,
      schemaId,
      issuer
    );
    await tx.wait();
    return tx;
  }

  async getCredentialDefinition(
    credDefId: string,
    networkName: string = "mainnet"
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    return contract.getCredentialDefinition(credDefId);
  }

  async issueCredential(
    credId: string,
    credDefId: string,
    issuer: string,
    subject: string,
    issuanceDate: string,
    expiryDate: string,
    metadata: string,
    networkName: string = "mainnet"
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    return contract.issueCredential(
      credId,
      credDefId,
      issuer,
      subject,
      issuanceDate,
      expiryDate,
      metadata
    );
  }

  async revokeCredential(credId: string, networkName: string = "mainnet") {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    return contract.revokeCredential(credId);
  }

  async isCredentialRevoked(credId: string, networkName: string = "mainnet") {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    return contract.isCredentialRevoked(credId);
  }

  async getDID(did: string, networkName: string = "mainnet") {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    return contract.getDID(did);
  }

  async registerDID(
    did: string,
    context: string,
    metadata: string,
    networkName: string = "mainnet"
  ) {
    const { signer } = await this.getProviderAndSigner(networkName);
    const contract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      signer
    );
    return contract.registerDID(did, context, metadata);
  }
}
