import { ChangeDetectorRef, Component, OnInit, OnDestroy, TemplateRef } from '@angular/core';
import { WalletService } from '../../../services/wallet.service';
import { combineLatest, Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { AddressBookService } from '../../../services/address-book.service';
import { NotificationService } from '../../../services/notification.service';
import { EtherWalletService } from 'src/app/services/ether-wallet.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-erc20-wallet',
  templateUrl: './erc20-wallet.component.html',
  styleUrls: ['./erc20-wallet.component.scss']
})
export class Erc20WalletComponent implements OnInit, OnDestroy {
  neotubeSite = environment.neotubeSite[environment.neoNetwork];
  etherscan = environment.etherscan[environment.neoNetwork];
  bscscan = environment.bscscan[environment.neoNetwork];
  swapHistory: any[] = [];
  address = this.etherService.selectedAddress;
  addresslc: string;
  loading = true;
  showEditName = false;
  addressBookNameTemp = '';
  recoverPrivateKeyText = 'Recover private key';
  recoveredPrivateKey = null;
  subscriptions: Subscription[] = [];
  balances: any[] = [];
  transactions: any[];
  erc20Transactions: any[];
  internalTransactions: any[];
  noWallet = true;

	desktop = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private changeDetection: ChangeDetectorRef,
    private addressBookService: AddressBookService,
    private notificationService: NotificationService,
    private walletService: WalletService,
    public etherService: EtherWalletService,
    private notifications: NotificationService,
  ) {
      if (environment.desktop) {
        this.desktop = true;
      }
  }

  async ngOnInit() {
    this.addresslc = this.address.toLowerCase();
    this.loadWallet();
    this.getSwapHistory();
  }
  async ngOnDestroy() {
    this.etherService.swapHistory = [];
  }
  async getSwapHistory() {
    const accounts: any[] = await this.etherService.getAccounts();
    const swaptransactions: any = await this.etherService.swapInfosByAddress(
      this.etherService.selectedAddress ? this.etherService.selectedAddress : accounts[0],
      0,
      20
    );
    this.swapHistory = swaptransactions.data.infos;
    console.log('this.swapHistory', this.swapHistory);
  }
  async loadWallet() {
    if (this.etherService.selectedAddress) {
      this.noWallet = false;
    }
    this.loading = false;
  }

  async switchnetwork() {
    try {
      this.etherService.connect();
      console.log('switchnetwork.this.etherService.provider', this.etherService.provider);
      if (this.etherService.provider) {
        console.log('localStorage.getItem(chainType)', localStorage.getItem('chainType'));
        if ( environment.neoNetwork == 'test' && localStorage.getItem('chainType') == 'eth' ) {
          console.log('switchnetwork.this.etherService.NETWORK_CHAIN_ID', this.etherService.NETWORK_CHAIN_ID);
          if ( this.etherService.NETWORK_CHAIN_ID != 4 ) {
              this.etherService?.disconnectWallet();
              return this.notifications.sendWarning('Please switch network to Rinkby');
          } else {
          this.etherService?.connect();
        }
      }
        if ( environment.neoNetwork == 'main' && localStorage.getItem('chainType') == 'eth' ) {
          if ( this.etherService.NETWORK_CHAIN_ID != 1 ) {
            this.etherService?.disconnectWallet();
            return this.notifications.sendWarning('Please switch network to Ethereum Mainnet');
          } else {
          this.etherService?.connect();
        }
      }
      }
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async getBalances() {
    console.log(this.address);
    // const balances = await this.etherService.getBalances(this.address);
  }

  deleteWallet() {
    this.router.navigate(['myaccounts/']);
  }

}
