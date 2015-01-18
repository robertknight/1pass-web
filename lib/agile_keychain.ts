/// <reference path="../typings/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../typings/DefinitelyTyped/q/Q.d.ts" />
/// <reference path="../typings/DefinitelyTyped/underscore/underscore.d.ts" />
/// <reference path="../typings/atob.d.ts" />

import atob = require('atob');
import btoa = require('btoa');
import Q = require('q');
import Path = require('path');
import underscore = require('underscore');

import asyncutil = require('./base/asyncutil');
import agile_keychain_entries = require('./agile_keychain_entries');
import collectionutil = require('./base/collectionutil');
import crypto = require('./onepass_crypto');
import dateutil = require('./base/dateutil');
import event_stream = require('./base/event_stream');
import item_store = require('./item_store');
import key_agent = require('./key_agent');
import stringutil = require('./base/stringutil');
import vfs = require('./vfs/vfs');

var fieldKindMap = new collectionutil.BiDiMap<item_store.FieldType, string>()
 .add(item_store.FieldType.Text, 'string')
 .add(item_store.FieldType.Password, 'concealed')
 .add(item_store.FieldType.Address, 'address')
 .add(item_store.FieldType.Date, 'date')
 .add(item_store.FieldType.MonthYear, 'monthYear')
 .add(item_store.FieldType.URL, 'URL')
 .add(item_store.FieldType.CreditCardType, 'cctype')
 .add(item_store.FieldType.PhoneNumber, 'phone')
 .add(item_store.FieldType.Gender, 'gender')
 .add(item_store.FieldType.Email, 'email')
 .add(item_store.FieldType.Menu, 'menu');

// mapping between input element types
// and the single-char codes used to represent
// them in .1password files
var fieldTypeCodeMap = new collectionutil.BiDiMap<item_store.FormFieldType, string>()
 .add(item_store.FormFieldType.Text, 'T')
 .add(item_store.FormFieldType.Password, 'P')
 .add(item_store.FormFieldType.Email, 'E')
 .add(item_store.FormFieldType.Checkbox, 'C')
 .add(item_store.FormFieldType.Input, 'I');

/** Default number of iterations to use in the PBKDF2 password
  * stretching function used to secure the master key.
  *
  * The default value was taken from a recent version of
  * the official 1Password v4 app for Mac (13/05/14)
  */
export var DEFAULT_VAULT_PASS_ITERATIONS = 80000;

// TODO: 'SL5' is the default and only used value for items
// in current versions of 1Password as far as I know but
// the Agile Keychain allows multiple security levels to be defined.
// This item data could perhaps be stored in a field for store-specific
// data within the item_store.Item?
var DEFAULT_AGILEKEYCHAIN_SECURITY_LEVEL = 'SL5';

/** Convert an item to JSON data for serialization in a .1password file.
  * @p encryptedData is the encrypted version of the item's content.
  */
export function toAgileKeychainItem(item: item_store.Item, encryptedData: string) : agile_keychain_entries.Item {
	var keychainItem: any = {};

	keychainItem.createdAt = dateutil.unixTimestampFromDate(item.createdAt);
	keychainItem.updatedAt = dateutil.unixTimestampFromDate(item.updatedAt);
	keychainItem.title = item.title;
	keychainItem.securityLevel = DEFAULT_AGILEKEYCHAIN_SECURITY_LEVEL;
	keychainItem.encrypted = btoa(encryptedData);
	keychainItem.typeName = item.typeName;
	keychainItem.uuid = item.uuid;
	keychainItem.location = item.primaryLocation();
	keychainItem.folderUuid = item.folderUuid;
	keychainItem.faveIndex = item.faveIndex;
	keychainItem.trashed = item.trashed;
	keychainItem.openContents = item.openContents;

	return keychainItem;
}

/** Parses an item_store.Item from JSON data in a .1password file.
  *
  * The item content is initially encrypted. The decrypted
  * contents can be retrieved using getContent()
  */
export function fromAgileKeychainItem(vault: Vault, data: agile_keychain_entries.Item) : item_store.Item {
	var item = new item_store.Item(vault);
	item.updatedAt = dateutil.dateFromUnixTimestamp(data.updatedAt);
	item.title = data.title;

	// These fields are not currently stored in
	// an item_store.Item directly. They could potentially be stored in
	// a Store-specific data field in the item?
	//
	//  - data.securityLevel
	//  - data.encrypted

	if (data.secureContents) {
		item.setContent(fromAgileKeychainContent(data.secureContents));
	}

	item.typeName = data.typeName;
	item.uuid = data.uuid;
	item.createdAt = dateutil.dateFromUnixTimestamp(data.createdAt);

	if (data.location) {
		item.locations.push(data.location);
	}

	item.folderUuid = data.folderUuid;
	item.faveIndex = data.faveIndex;
	item.trashed = data.trashed;
	item.openContents = data.openContents;
	return item;
}

export function toAgileKeychainField(field: item_store.ItemField) : agile_keychain_entries.ItemField {
	var keychainField = new agile_keychain_entries.ItemField;
	keychainField.k = fieldKindMap.get(field.kind);
	keychainField.n = field.name;
	keychainField.t = field.title;
	keychainField.v = field.value;
	return keychainField;
}

export function fromAgileKeychainField(fieldData: agile_keychain_entries.ItemField) : item_store.ItemField {
	var field = new item_store.ItemField;
	field.kind = fieldKindMap.get2(fieldData.k);
	field.name = fieldData.n;
	field.title = fieldData.t;
	field.value = fieldData.v;
	return field;
}

/** Convert an item_store.ItemContent entry into a `contents` blob for storage in
  * a 1Password item.
  */
function toAgileKeychainContent(content: item_store.ItemContent) : agile_keychain_entries.ItemContent {
	var keychainContent = new agile_keychain_entries.ItemContent();
	if (content.sections) {
		keychainContent.sections = [];
		content.sections.forEach((section) => {
			keychainContent.sections.push(toAgileKeychainSection(section));
		});
	}
	if (content.urls) {
		keychainContent.URLs = [];
		content.urls.forEach((url) => {
			keychainContent.URLs.push(url);
		});
	}
	keychainContent.notesPlain = content.notes;
	if (content.formFields) {
		keychainContent.fields = [];
		content.formFields.forEach((field) => {
			keychainContent.fields.push(toAgileKeychainFormField(field));
		});
	}
	keychainContent.htmlAction = content.htmlAction;
	keychainContent.htmlMethod = content.htmlMethod;
	keychainContent.htmlID = content.htmlId;
	return keychainContent;
}

/** Convert a decrypted JSON `contents` blob from a 1Password item
  * into an item_store.ItemContent instance.
  */
function fromAgileKeychainContent(data: agile_keychain_entries.ItemContent) : item_store.ItemContent {
	var content = new item_store.ItemContent();
	if (data.sections) {
		data.sections.forEach((section) => {
			content.sections.push(fromAgileKeychainSection(section));
		});
	}
	if (data.URLs) {
		data.URLs.forEach((url) => {
			content.urls.push(url);
		});
	}
	if (data.notesPlain) {
		content.notes = data.notesPlain;
	}
	if (data.fields) {
		data.fields.forEach((field) => {
			content.formFields.push(fromAgileKeychainFormField(field));
		});
	}
	if (data.htmlAction) {
		content.htmlAction = data.htmlAction;
	}
	if (data.htmlMethod) {
		content.htmlMethod = data.htmlMethod;
	}
	if (data.htmlID) {
		content.htmlId = data.htmlID;
	}

	return content;
}

function toAgileKeychainSection(section: item_store.ItemSection) : agile_keychain_entries.ItemSection {
	var keychainSection = new agile_keychain_entries.ItemSection();
	keychainSection.name = section.name;
	keychainSection.title = section.title;
	keychainSection.fields = [];
	section.fields.forEach((field) => {
		keychainSection.fields.push(toAgileKeychainField(field));
	});
	return keychainSection;
}

/** Convert a section entry from the JSON contents blob for
  * an item into an item_store.ItemSection instance.
  */
function fromAgileKeychainSection(data: agile_keychain_entries.ItemSection) : item_store.ItemSection {
	var section = new item_store.ItemSection();
	section.name = data.name;
	section.title = data.title;
	section.fields = [];
	if (data.fields) {
		data.fields.forEach((fieldData) => {
			section.fields.push(fromAgileKeychainField(fieldData));
		});
	}
	return section;
}

function toAgileKeychainFormField(field: item_store.WebFormField) : agile_keychain_entries.WebFormField {
	var keychainField = new agile_keychain_entries.WebFormField();
	keychainField.id = field.id;
	keychainField.name = field.name;
	keychainField.type = fieldTypeCodeMap.get(field.type);
	keychainField.designation = field.designation;
	keychainField.value = field.value;
	return keychainField;
}

function fromAgileKeychainFormField(keychainField: agile_keychain_entries.WebFormField) : item_store.WebFormField {
	var field = new item_store.WebFormField();
	field.id = keychainField.id;
	field.name = keychainField.name;
	field.type = fieldTypeCodeMap.get2(keychainField.type);
	field.designation = keychainField.designation;
	field.value = keychainField.value;
	return field;
}

/** Represents an Agile Keychain-format 1Password vault. */
export class Vault implements item_store.Store {
	private fs: vfs.VFS;
	private path: string;
	private keyAgent: key_agent.KeyAgent;
	private keys : Q.Promise<agile_keychain_entries.EncryptionKeyEntry[]>;

	// map of (item ID -> Item) for items that have been
	// modified and require the contents.js index file to be updated
	private pendingIndexUpdates: collectionutil.PMap<string, item_store.Item>;

	// promise which is resolved when the current flush of
	// index updates completes
	private indexUpdated: Q.Promise<void>;
	private indexUpdatePending: boolean;

	onItemUpdated: event_stream.EventStream<item_store.Item>;
	onUnlock: event_stream.EventStream<void>;

	/** Setup a vault which is stored at @p path in a filesystem.
	  * @p fs is the filesystem interface through which the
	  * files that make up the vault are accessed.
	  */
	constructor(fs: vfs.VFS, path: string, agent? : key_agent.KeyAgent) {
		this.fs = fs;
		this.path = path;
		this.keyAgent = agent || new key_agent.SimpleKeyAgent(crypto.defaultCrypto);
		this.onItemUpdated = new event_stream.EventStream<item_store.Item>();
		this.onUnlock = new event_stream.EventStream<void>();

		this.pendingIndexUpdates = new collectionutil.PMap<string,item_store.Item>();
		this.indexUpdated = Q<void>(null);
		this.indexUpdatePending = false;
	}

	private getKeys() : Q.Promise<agile_keychain_entries.EncryptionKeyEntry[]> {
		if (!this.keys) {
			this.keys = this.loadKeys();
		}
		return this.keys;
	}

	private loadKeys() : Q.Promise<agile_keychain_entries.EncryptionKeyEntry[]> {
		var keys = Q.defer<agile_keychain_entries.EncryptionKeyEntry[]>();
		var content = this.fs.read(Path.join(this.dataFolderPath(), 'encryptionKeys.js'));
		content.then((content:string) => {
			var keyList : agile_keychain_entries.EncryptionKeyList = JSON.parse(content);
			if (!keyList.list) {
				keys.reject('Missing `list` entry in encryptionKeys.js file');
				return;
			}
			var vaultKeys : agile_keychain_entries.EncryptionKeyEntry[] = [];
			keyList.list.forEach((entry) => {
				// Using 1Password v4, there are two entries in the
				// encryptionKeys.js file, 'SL5' and 'SL3'.
				// 'SL3' appears to be unused so speed up the unlock
				// process by skipping it
				if (entry.level != "SL3") {
					vaultKeys.push(entry);
				}
			});
			keys.resolve(vaultKeys);
		}, (err) => {
			keys.reject(err);
		})
		.done();

		return keys.promise;
	}

	private writeKeys(keyList: agile_keychain_entries.EncryptionKeyList, passHint: string) : Q.Promise<void> {
		// FIXME - Improve handling of concurrent attempts to update encryptionKeys.js.
		// If the file in the VFS has been modified since the original read, the operation
		// should fail.

		var keyJSON = collectionutil.prettyJSON(keyList);
		var keysSaved = this.fs.write(Path.join(this.dataFolderPath(), 'encryptionKeys.js'), keyJSON);
		var hintSaved = this.fs.write(Path.join(this.dataFolderPath(), '.password.hint'), passHint);
		return asyncutil.eraseResult(Q.all([keysSaved, hintSaved]));
	}

	listKeys() : Q.Promise<key_agent.Key[]> {
		return this.getKeys().then((keyEntries) => {
			return keyEntries.map((keyEntry) => {
				// TODO - The key's 'level' property is unused here
				return {
					format: key_agent.KeyFormat.AgileKeychainKey,
					data: keyEntry.data,
					identifier: keyEntry.identifier,
					iterations: keyEntry.iterations,
					validation: keyEntry.validation
				};
			});
		});
	}

	saveKeys(keys: key_agent.Key[], hint: string) {
		if (true) { // suppress TSLint warning about unreachable code
			throw new Error('onepass.Vault.saveKeys() is not implemented');
		}
		return Q<void>(null);
	}

	/** Unlock the vault using the given master password.
	  * This must be called before item contents can be decrypted.
	  */
	unlock(pwd: string) : Q.Promise<void> {
		return this.listKeys().then((keys) => {
			return key_agent.decryptKeys(keys, pwd);
		}).then((keys) => {
			var savedKeys: Q.Promise<void>[] = [];
			keys.forEach((key) => {
				savedKeys.push(this.keyAgent.addKey(key.id, key.key));
			});
			return asyncutil.eraseResult(Q.all(savedKeys)).then(() => {
				this.onUnlock.publish(null);
			});
		});
	}

	/** Lock the vault. This discards decrypted master keys for the vault
	  * created via a call to unlock()
	  */
	lock() : Q.Promise<void> {
		return this.keyAgent.forgetKeys();
	}

	/** Returns true if the vault was successfully unlocked using unlock().
	  * Only once the vault is unlocked can item contents be retrieved using item_store.Item.getContents()
	  */
	isLocked() : Q.Promise<boolean> {
		return Q.all([this.keyAgent.listKeys(), this.getKeys()]).spread<boolean>(
			(keyIDs: string[], keyEntries: agile_keychain_entries.EncryptionKeyEntry[]) => {

			var locked = false;
			keyEntries.forEach((entry) => {
				if (keyIDs.indexOf(entry.identifier) == -1) {
					locked = true;
				}
			});
			return locked;
		});
	}

	private itemPath(uuid: string) : string {
		return Path.join(this.path, 'data/default/' + uuid + '.1password')
	}

	loadItem(uuid: string) : Q.Promise<item_store.Item> {
		var content = this.fs.read(this.itemPath(uuid));
		return content.then((content) => {
			return fromAgileKeychainItem(this, JSON.parse(content));
		});
	}

	saveItem(item: item_store.Item, source?: item_store.ChangeSource) : Q.Promise<void> {
		if (source !== item_store.ChangeSource.Sync) {
			item.updateTimestamps();
		}

		// update the '<item ID>.1password' file
		var itemSaved = item.getContent().then((content) => {
			item.updateOverviewFromContent(content);

			var contentJSON = JSON.stringify(toAgileKeychainContent(content));
			return this.encryptItemData(DEFAULT_AGILEKEYCHAIN_SECURITY_LEVEL, contentJSON);
		}).then((encryptedContent) => {
				var itemPath = this.itemPath(item.uuid);
				var keychainJSON = JSON.stringify(toAgileKeychainItem(item, encryptedContent));
			return this.fs.write(itemPath, keychainJSON);
		});

		// update the contents.js index file.
		//
		// Updates are added to a queue which is then flushed so that an update for one
		// entry does not clobber an update for another. This also reduces the number
		// of VFS requests.
		// 
		this.pendingIndexUpdates.set(item.uuid, item);
		var indexSaved = asyncutil.until(() => {
			// wait for the current index update to complete
			return this.indexUpdated.then(() => {
				if (this.pendingIndexUpdates.size == 0) {
					// if there are no more updates to save,
					// we're done
					return true;
				} else {
					// otherwise, schedule another flush of updates
					// to the index, unless another save operation
					// has already started one
					if (!this.indexUpdatePending) {
						this.saveContentsFile();
					}
					return false;
				}
			});
		});

		return <any>Q.all([itemSaved, indexSaved]).then(() => {
			this.onItemUpdated.publish(item);
		});
	}

	// save pending changes to the contents.js index file
	private saveContentsFile() {
		var overviewSaved = Q.defer<void>();
		var revision: string;

		this.indexUpdated = this.fs.stat(this.contentsFilePath()).then((stat) => {
			revision = stat.revision;
			return this.fs.read(this.contentsFilePath());
		}).then((contentsJSON) => {
			// [TODO TypeScript/1.3] - Type the contents.js entry tuples
			var updatedItems: item_store.Item[] = [];
			this.pendingIndexUpdates.forEach((item) => {
				updatedItems.push(item);
			});
			this.pendingIndexUpdates.clear();

			var contentEntries : any[] = JSON.parse(contentsJSON);
			updatedItems.forEach((item) => {
				var entry = underscore.find(contentEntries, (entry) => { return entry[0] == item.uuid });
				if (!entry) {
					entry = [null, null, null, null, null, null, null, null];
					contentEntries.push(entry);
				}
				entry[0] = item.uuid;
				entry[1] = item.typeName;
				entry[2] = item.title;
				entry[3] = item.primaryLocation();
				entry[4] = dateutil.unixTimestampFromDate(item.updatedAt);
				entry[5] = item.folderUuid;
				entry[6] = 0; // TODO - Find out what this is used for
				entry[7] = (item.trashed ? "Y" : "N");
			});

			var newContentsJSON = JSON.stringify(contentEntries);
			return asyncutil.resolveWith(overviewSaved, this.fs.write(this.contentsFilePath(), newContentsJSON, {
				parentRevision: revision
			}));
		});
		
		this.indexUpdatePending = true;
		this.indexUpdated.then(() => {
			this.indexUpdatePending = false;
		});
	}

	private dataFolderPath() : string {
		return Path.join(this.path, 'data/default');
	}

	private contentsFilePath() : string {
		return Path.join(this.dataFolderPath(), 'contents.js');
	}

	/** Returns a list of overview data for all items in the vault,
	  * except tombstone markers for deleted items.
	  *
	  * Note: The items returned by listItems() are from the index
	  * file and only contain the item's UUID, title, last-update date,
	  * type name and primary location.
	  *
	  * The createdAt, faveIndex, openContents, locations and account
	  * fields are not set.
	  *
	  * FIXME: Use the type system to represent the above
	  */
	listItems(opts: item_store.ListItemsOptions = {}) : Q.Promise<item_store.Item[]> {
		var items = Q.defer<item_store.Item[]>();
		var content = this.fs.read(this.contentsFilePath());
		content.then((content) => {
			var entries = JSON.parse(content);
			var vaultItems : item_store.Item[] = [];
			entries.forEach((entry: any[]) => {
				var item = new item_store.Item(this);
				item.uuid = entry[0];
				item.typeName = entry[1];
				item.title = entry[2];

				var primaryLocation = entry[3];
				if (primaryLocation) {
					item.locations.push(primaryLocation);
				}

				item.updatedAt = dateutil.dateFromUnixTimestamp(entry[4]);
				item.folderUuid = entry[5];
				item.trashed = entry[7] === "Y";

				if (item.isTombstone() && !opts.includeTombstones) {
					// skip markers for deleted items
					return;
				}

				vaultItems.push(item);
			});
			items.resolve(vaultItems);
		}, (err: any) => {
			items.reject(err);
		}).done();
		return items.promise;
	}

	decryptItemData(level: string, data: string) : Q.Promise<string> {
		return this.getKeys().then((keys) => {
			var result : Q.Promise<string>;
			keys.forEach((key) => {
				if (key.level == level) {
					var cryptoParams = new key_agent.CryptoParams(key_agent.CryptoAlgorithm.AES128_OpenSSLKey);
					result = this.keyAgent.decrypt(key.identifier, data, cryptoParams);
					return;
				}
			});
			if (result) {
				return result;
			} else {
				return Q.reject<string>('No key ' + level + ' found');
			}
		});
	}

	encryptItemData(level: string, data: string) : Q.Promise<string> {
		return this.getKeys().then((keys) => {
			var result : Q.Promise<string>;
			keys.forEach((key) => {
				if (key.level == level) {
					var cryptoParams = new key_agent.CryptoParams(key_agent.CryptoAlgorithm.AES128_OpenSSLKey);
					result = this.keyAgent.encrypt(key.identifier, data, cryptoParams);
					return;
				}
			});
			if (result) {
				return result;
			} else {
				return Q.reject<string>('No key ' + level + ' found');
			}
		});
	}

	/** Change the master password for the vault.
	  *
	  * This decrypts the existing master key and re-encrypts it with @p newPass.
	  *
	  * @param oldPass The current password for the vault
	  * @param newPass The new password for the vault
	  * @param newPassHint The user-provided hint for the new password
	  * @param iterations The number of iterations of the key derivation function
	  *  to use when generating an encryption key from @p newPass. If not specified,
	  *  use the same number of iterations as the existing key.
	  */
	changePassword(oldPass: string, newPass: string, newPassHint: string, iterations?: number) : Q.Promise<void> {
		return this.isLocked().then((locked) => {
			if (locked) {
				return Q.reject<agile_keychain_entries.EncryptionKeyEntry[]>(new Error('Vault must be unlocked before changing the password'));
			}
			return this.getKeys();
		}).then((keys) => {
			var keyList = <agile_keychain_entries.EncryptionKeyList>{
				list: []
			};

			try {
				keys.forEach((key) => {
					var oldSaltCipher = crypto.extractSaltAndCipherText(atob(key.data));
					var newSalt = crypto.randomBytes(8);
					var derivedKey = key_agent.keyFromPasswordSync(oldPass, oldSaltCipher.salt, key.iterations);
					var oldKey = key_agent.decryptKey(derivedKey, oldSaltCipher.cipherText,
					  atob(key.validation));
					var newKeyIterations = iterations || key.iterations;
					var newDerivedKey = key_agent.keyFromPasswordSync(newPass, newSalt, newKeyIterations);
					var newKey = key_agent.encryptKey(newDerivedKey, oldKey);
					var newKeyEntry = {
						data: btoa('Salted__' + newSalt + newKey.key),
						identifier: key.identifier,
						iterations: newKeyIterations,
						level: key.level,
						validation: btoa(newKey.validation)
					};
					keyList.list.push(newKeyEntry);
					keyList[newKeyEntry.level] = newKeyEntry.identifier;
				});
			} catch (err) {
				return Q.reject<void>(err);
			}

			this.keys = null;
			return this.writeKeys(keyList, newPassHint);
		});
	}

	/** Initialize a new empty vault in @p path with
	  * a given master @p password.
	  */
	static createVault(fs: vfs.VFS, path: string, password: string, hint: string,
	  passIterations: number = DEFAULT_VAULT_PASS_ITERATIONS) : Q.Promise<Vault> {
		if (!stringutil.endsWith(path, '.agilekeychain')) {
			path += '.agilekeychain';
		}

		var vault = new Vault(fs, path);

		// 1. Check for no existing vault at @p path
		// 2. Add empty contents.js, encryptionKeys.js, 1Password.keys files
		// 3. If this is a Dropbox folder and no file exists in the root
		//    specifying the vault path, add one
		// 4. Generate new random key and encrypt with master password

		var masterKey = crypto.randomBytes(1024);
		var salt = crypto.randomBytes(8);
		var derivedKey = key_agent.keyFromPasswordSync(password, salt, passIterations);
		var encryptedKey = key_agent.encryptKey(derivedKey, masterKey);

		var masterKeyEntry = {
			data: btoa('Salted__' + salt + encryptedKey.key),
			identifier: crypto.newUUID(),
			iterations: passIterations,
			level: 'SL5',
			validation: btoa(encryptedKey.validation)
		};

		var keyList = <agile_keychain_entries.EncryptionKeyList>{
			list: [masterKeyEntry],
			SL5: masterKeyEntry.identifier
		};

		return fs.mkpath(vault.dataFolderPath()).then(() => {
			var keysSaved = vault.writeKeys(keyList, hint);
			var contentsSaved = fs.write(vault.contentsFilePath(), '[]');
			return Q.all([keysSaved, contentsSaved]);
		}).then(() => {
			return vault;
		});
	}

	passwordHint() : Q.Promise<string> {
		return this.fs.read(Path.join(this.dataFolderPath(), '.password.hint'));
	}

	vaultPath() : string {
		return this.path;
	}

	getRawDecryptedData(item: item_store.Item) : Q.Promise<string> {
		var encryptedContent = this.fs.read(this.itemPath(item.uuid));
		return encryptedContent.then((content) => {
			var keychainItem = <agile_keychain_entries.Item>JSON.parse(content);
			return this.decryptItemData(keychainItem.securityLevel, atob(keychainItem.encrypted));
		});
	}

	getContent(item: item_store.Item) : Q.Promise<item_store.ItemContent> {
		return this.getRawDecryptedData(item).then((data: string) => {
			var content = <agile_keychain_entries.ItemContent>(JSON.parse(data));
			return fromAgileKeychainContent(content);
		});
	}

	clear() {
		// not implemented for onepass.Vault since this is the user's
		// primary data source.
		return Q.reject<void>(new Error('Primary vault does not support being cleared'));
	}
}
