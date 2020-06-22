import React from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import './styles.scss';
import Table from '../../../../components/Table/Table';
import { get, remove } from '../../../../utils/api';
import { formatDateTime } from '../../../../utils/converters';
import {
  uriTopicData,
  uriTopicsPartitions,
  uriTopicDataSearch,
  uriSchemaRegistry,
  uriTopicDataDelete
} from '../../../../utils/endpoints';
import CodeViewModal from '../../../../components/Modal/CodeViewModal/CodeViewModal';
import Modal from '../../../../components/Modal/Modal';
import Pagination from '../../../../components/Pagination/Pagination';
import moment from 'moment';
import DatePicker from '../../../../components/DatePicker';
import _ from 'lodash';
import constants from '../../../../utils/constants';
import AceEditor from 'react-ace';
import ConfirmModal from '../../../../components/Modal/ConfirmModal';
// Adaptation of data.ftl

class TopicData extends React.Component {
  state = {
    showValueModal: false,
    valueModalBody: '',
    showHeadersModal: false,
    headersModalBody: '',
    sortBy: 'Oldest',
    sortOptions: ['Oldest', 'Newest'],
    partitionCount: 0,
    partition: 'All',
    partitionOptions: [],
    offsetsOptions: [],
    timestamp: '',
    currentSearch: '',
    search: '',
    offsets: {},
    offsetsSearch: '',
    openDateModal: false,
    messages: [],
    pageNumber: 1,
    nextPage: '',
    recordCount: 0,
    showFilters: '',
    showDeleteModal: false,
    deleteMessage: '',
    compactMessageToDelete: '',
    selectedCluster: this.props.clusterId,
    selectedTopic: this.props.topicId,
    cleanupPolicy: '',
    datetime: '',
    schemas: [],
    roles: JSON.parse(localStorage.getItem('roles')),
    canDeleteRecords: false
  };

  eventSource;

  componentDidMount = () => {
    let { clusterId, topicId } = this.props.match.params;
    const { history } = this.props;
    const roles = this.state.roles || {};

    this.setState(
      {
        selectedCluster: clusterId,
        selectedTopic: topicId,
        canAccessSchema: roles.topic && roles.topic['registry/read']
      },
      () => {
        history.replace({
          loading: true
        });
        this.getMessages();
      }
    );
  };

  componentWillUnmount = () => {
    this.onStop();
  };

  startEventSource = () => {
    let { clusterId, topicId } = this.props.match.params;
    const { currentSearch } = this.state;
    let self = this;
    this.setState({ messages: [], pageNumber: 1 });
    this.eventSource = new EventSource(uriTopicDataSearch(clusterId, topicId, currentSearch));
    this.eventSource.addEventListener('searchBody', function(e) {
      let res = JSON.parse(e.data);
      self.setState({ isSearching: true }, () => {
        self.handleMessages(res.records || [], true);
      });
    });

    this.eventSource.addEventListener('searchEnd', function(e) {
      self.eventSource.close();
      self.setState({ isSearching: false });
    });
  };

  onStop = () => {
    if (this.eventSource) {
      this.eventSource.close();
    }
    this.setState({ isSearching: false });
  };

  onStart = () => {
    this.startEventSource();
  };

  showValueModal = body => {
    this.setState({
      showValueModal: true,
      valueModalBody: body
    });
  };

  closeValueModal = () => {
    this.setState({ showValueModal: false, valueModalBody: '' });
  };

  showHeadersModal = headers => {
    this.setState({
      showHeadersModal: true,
      headersModalBody: Object.keys(headers).map(key => {
        return { key: key, value: headers[key] };
      })
    });
  };

  closeHeadersModal = () => {
    this.setState({ showHeadersModal: false, headersModalBody: '' });
  };

  async getMessages(changePage = false) {
    const { history } = this.props;
    const {
      selectedCluster,
      selectedTopic,
      canAccessSchema,
      sortBy,
      partition,
      datetime,
      currentSearch,
      offsetsSearch,
      nextPage
    } = this.state;
    let data,
      partitionData = {};
    let timestamp = datetime.toString().length > 0 ? moment(datetime) : '';
    try {
      data = await get(
        uriTopicData(
          selectedCluster,
          selectedTopic,
          offsetsSearch !== '' ? offsetsSearch : undefined,
          partition,
          sortBy,
          timestamp !== ''
            ? formatDateTime(
                {
                  year: timestamp.year(),
                  monthValue: timestamp.month() + 1,
                  dayOfMonth: timestamp.date(),
                  hour: timestamp.hour(),
                  minute: timestamp.minute(),
                  second: timestamp.second(),
                  milli: timestamp.millisecond()
                },
                'YYYY-MM-DDThh:mm:ss.SSS',
                true
              ) + 'Z'
            : undefined,
          currentSearch !== '' ? currentSearch : undefined,
          changePage ? nextPage : undefined
        )
      );

      data = data.data;
      this.setState({ canDeleteRecords: data.canDeleteRecords });

      let schemas = [];
      if (canAccessSchema) {
        schemas = await get(uriSchemaRegistry(selectedCluster, '', ''));
        schemas = schemas.data.results || [];
      }
      this.setState({ schemas });
      partitionData = await get(uriTopicsPartitions(selectedCluster, selectedTopic));
      partitionData = partitionData.data;
      if (data.results) {
        this.handleMessages(data.results);
      } else {
        this.setState({ messages: [], pageNumber: 1 });
      }
      if (partitionData) {
        if (changePage) {
          this.getNextPageOffsets();
        }
        this.setState({
          partitionCount: partitionData.length,
          nextPage: data.after,
          recordCount: data.size
        });
      }
    } catch (err) {
      if (err.response && err.response.status === 404) {
        history.replace('/ui/page-not-found', { errorData: err });
      } else {
        history.replace('/ui/error', { errorData: err });
      }
    } finally {
      history.replace({
        loading: false
      });
    }
  }

  handleOnDelete(message) {
    this.setState({ compactMessageToDelete: message }, () => {
      this.showDeleteModal(
        <React.Fragment>
          Do you want to delete message: {<code>{message.key}</code>} ?
        </React.Fragment>
      );
    });
  }

  showDeleteModal = deleteMessage => {
    this.setState({ showDeleteModal: true, deleteMessage });
  };

  closeDeleteModal = () => {
    this.setState({ showDeleteModal: false, deleteMessage: '' });
  };

  deleteCompactMessage = () => {
    const { selectedCluster, selectedTopic, compactMessageToDelete: message } = this.state;
    const { history } = this.props;
    history.replace({ loading: true });
    const encodedkey = new Buffer(message.key).toString('base64');
    const deleteData = { partition: parseInt(message.partition), key: encodedkey };
    remove(
      uriTopicDataDelete(selectedCluster, selectedTopic, parseInt(message.partition), encodedkey),
      deleteData
    )
      .then(res => {
        this.props.history.replace({
          ...this.props.location,
          showSuccessToast: true,
          successToastMessage: `Record '${message}' will be deleted on compaction`,
          loading: false
        });
        this.setState({ showDeleteModal: false, compactMessageToDelete: '' }, () => {
          this.getMessages();
        });
      })
      .catch(err => {
        this.props.history.replace({
          ...this.props.location,
          showErrorToast: true,
          errorToastMessage: `Failed to delete message from '${message}'`,
          loading: false
        });
        this.setState({ showDeleteModal: false, messageToDelete: {} });
      });
  };

  handleMessages = (messages, append = false) => {
    let tableMessages = (append)? this.state.messages: [];
    messages.forEach(message => {
      let date = new Date(message.timestamp);
      let messageToPush = {
        key: message.key || '',
        value: message.value || '',
        timestamp: moment(date).format('DD-MM-YYYY HH:mm'),
        partition: JSON.stringify(message.partition) || '',
        offset: JSON.stringify(message.offset) || '',
        headers: message.headers || {},
        schema: message.valueSchemaId || 'No schema'
      };
      tableMessages.push(messageToPush);
    });
    this.setState({ messages: tableMessages });
  };


  getNextPageOffsets = () => {
    const { nextPage } = this.state;
    let { offsets } = this.state;

    let aux = nextPage.substring(nextPage.indexOf('after=') + 6);
    let afterString = aux.substring(0, aux.indexOf('&'));
    const offsetsByPartition = afterString.split('_');

    offsetsByPartition.forEach(offsetByPartition => {
      const offset = offsetByPartition.split('-');
      offsets[`partition${offset[0]}`] = offset[1];
    });

    this.setState({ offsets });
  };

  createPartitionOptions = () => {
    const { partitionCount } = this.state;
    let partitionOptions = ['All'];
    for (let i = 0; i < partitionCount; i++) {
      partitionOptions.push(`${i}`);
    }
    return partitionOptions;
  };

  createOffsetsOptions = () => {
    const { partitionCount } = this.state;
    let offsetsOptions = [];
    for (let i = 0; i < partitionCount; i++) {
      offsetsOptions.push(`Partition ${i}`);
    }
    return offsetsOptions;
  };

  renderSortOptions() {
    const { sortOptions } = this.state;

    let renderedOptions = [];
    for (let option of sortOptions) {
      renderedOptions.push(
        <Dropdown.Item
          key={option}
          onClick={() => this.setState({ sortBy: option }, () => this.getMessages())}
        >
          <i className="fa fa-fw fa-sort-numeric-desc pull-left" aria-hidden="true" /> {option}
        </Dropdown.Item>
      );
    }
    return renderedOptions;
  }

  renderPartitionOptions = () => {
    const partitionOptions = this.createPartitionOptions();

    let renderedOptions = [];
    for (let option of partitionOptions) {
      renderedOptions.push(
        <Dropdown.Item
          key={option}
          onClick={() => this.setState({ partition: option }, () => this.getMessages())}
        >
          <i className="fa fa-fw pull-left" aria-hidden="true" /> {option}
        </Dropdown.Item>
      );
    }
    return renderedOptions;
  };

  renderOffsetsOptions = () => {
    const offsetsOptions = this.createOffsetsOptions();

    let renderedOptions = [];
    let i;
    for (i = 0; i < offsetsOptions.length; i++) {
      const option = offsetsOptions[i];
      const camelcaseOption = _.camelCase(option);
      let { offsets } = this.state;
      if (offsets[camelcaseOption] === undefined) {
        offsets[camelcaseOption] = '';
        this.setState({ offsets });
      }
      renderedOptions.push(
        <tr key={option}>
          <td className="offset-navbar-partition-label offset-navbar-partition-td">{option} : </td>
          <td className="offset-navbar-partition-td">
            <input
              style={{ maxWidth: '100px' }}
              className="form-control"
              type="number"
              min="0"
              name={`${i}`}
              value={offsets[camelcaseOption]}
              onChange={({ currentTarget: input }) => {
                let { offsets } = this.state;
                offsets[camelcaseOption] = input.value;
                this.setState(offsets);
              }}
            />
          </td>
        </tr>
      );
    }
    return renderedOptions;
  };

  openAndCloseFilters() {
    let { showFilters } = this.state;
    if (showFilters === 'show') {
      this.setState({ showFilters: '' });
    } else {
      this.setState({ showFilters: 'show' });
    }
  }
  render() {
    const {
      sortBy,
      partition,
      currentSearch,
      search,
      offsets,
      messages,
      showHeadersModal,
      showValueModal,
      valueModalBody,
      headersModalBody,
      pageNumber,
      recordCount,
      showFilters,
      datetime,
      isSearching,
      canDeleteRecords
    } = this.state;
    let date = moment(datetime);
    let { clusterId } = this.props.match.params;
    const { loading } = this.props.history.location;
    const firstColumns = [
      { colName: 'Key', colSpan: 1 },
      { colName: 'Value', colSpan: 1 },
      { colName: 'Date', colSpan: 1 },
      { colName: 'Partition', colSpan: 1 },
      { colName: 'Offset', colSpan: 1 },
      { colName: 'Headers', colSpan: 1 },
      { colname: 'Schema', colSpan: 1 }
    ];
    return (
      <React.Fragment>
        <nav
          className="navbar navbar-expand-lg navbar-light bg-light
         mr-auto khq-data-filter khq-sticky khq-nav"
        >
          <button
            className="navbar-toggler"
            type="button"
            data-toggle="collapse"
            data-target="#topic-data"
            aria-controls="topic-data"
            aria-expanded="false"
            aria-label="Toggle navigation"
            onClick={() => {
              this.openAndCloseFilters();
            }}
          >
            <span className="navbar-toggler-icon" />
          </button>

          <nav className="pagination-data">
            <div style={{ paddingTop: '1rem' }}>
              <label>Total records: ≈{recordCount}</label>
            </div>
            <div>
              <Pagination
                pageNumber={pageNumber}
                totalPageNumber={messages.length === 0 ? pageNumber : undefined}
                onChange={({ currentTarget: input }) => {
                  this.setState({ pageNumber: input.value });
                }}
                onSubmit={() => {
                  this.setState(
                    {
                      pageNumber: pageNumber + 1
                    },
                    () => {
                      this.getMessages(true);
                    }
                  );
                }}
                editPageNumber={false}
                showTotalPageNumber={false}
              />
            </div>
          </nav>

          <div className={`collapse navbar-collapse ${showFilters}`} id="topic-data">
            <ul className="navbar-nav mr-auto">
              <li className="nav-item dropdown">
                <Dropdown>
                  <Dropdown.Toggle className="nav-link dropdown-toggle">
                    <strong>Sort:</strong> ({sortBy})
                  </Dropdown.Toggle>
                  {!loading && <Dropdown.Menu>{this.renderSortOptions()}</Dropdown.Menu>}
                </Dropdown>
              </li>
              <li className="nav-item dropdown">
                <Dropdown>
                  <Dropdown.Toggle className="nav-link dropdown-toggle">
                    <strong>Partition:</strong> ({partition})
                  </Dropdown.Toggle>
                  {!loading && <Dropdown.Menu>{this.renderPartitionOptions()}</Dropdown.Menu>}
                </Dropdown>
              </li>
              <li className="nav-item dropdown">
                <Dropdown>
                  <Dropdown.Toggle className="nav-link dropdown-toggle">
                    <strong>Timestamp:</strong>
                    {datetime !== '' &&
                      ' ' +
                        formatDateTime(
                          {
                            year: date.year(),
                            monthValue: date.month(),
                            dayOfMonth: date.date(),
                            hour: date.hour(),
                            minute: date.minute(),
                            second: date.second()
                          },
                          'DD-MM-YYYY HH:mm'
                        )}
                  </Dropdown.Toggle>
                  {!loading && (
                    <Dropdown.Menu>
                      <div className="input-group">
                        <DatePicker
                          showDateTimeInput
                          showTimeSelect
                          value={datetime}
                          onChange={value => {
                            this.setState({ datetime: value }, () => this.getMessages());
                          }}
                        />
                      </div>
                    </Dropdown.Menu>
                  )}
                </Dropdown>
              </li>
              <li className="nav-item dropdown">
                <Dropdown>
                  <Dropdown.Toggle
                    className="nav-link dropdown-toggle"
                  >
                    <strong>Search:</strong> {currentSearch !== '' ? `(${currentSearch})` : ''}
                  </Dropdown.Toggle>
                  {!loading && (
                    <Dropdown.Menu>
                      <div style={{ minWidth: '300px' }} className="input-group">
                        <input
                          className="form-control"
                          name="search"
                          type="text"
                          value={search}
                          style={{ minWidth: '150px' }}
                          onChange={({ currentTarget: input }) => {
                            this.setState({ search: input.value });
                          }}
                        />
                        <div className="btn-border">
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() =>
                              this.setState({ currentSearch: search, search: '' }, () => {
                                if (this.state.currentSearch.length <= 0) {
                                  this.getMessages();
                                } else {
                                  this.onStart();
                                }
                              })
                            }
                          >
                            {isSearching ? (
                              <i className="fa fa-spinner fa-spin"></i>
                            ) : (
                              <i className="fa fa-search"></i>
                            )}
                          </button>
                          <button
                            className="btn btn-primary btn-border"
                            type="button"
                            disabled={!isSearching}
                            onClick={() => this.onStop()}
                          >
                            Stop
                          </button>
                        </div>
                      </div>
                    </Dropdown.Menu>
                  )}
                </Dropdown>
              </li>
              <li className="nav-item dropdown">
                <Dropdown>
                  <Dropdown.Toggle className="nav-link dropdown-toggle">
                    <strong>Offsets:</strong>
                  </Dropdown.Toggle>
                  {!loading && (
                    <Dropdown.Menu>
                      <div style={{ minWidth: '300px' }} className="khq-offset-navbar">
                        <div className="input-group">
                          <table>{this.renderOffsetsOptions()}</table>
                          <div className="input-group-append">
                            <button
                              className="btn btn-primary offsets-ok"
                              type="button"
                              onClick={() => {
                                let offsetsSearch = '';
                                for (let i = 0; i < Object.keys(offsets).length; i++) {
                                  if (Object.values(offsets)[i] !== '') {
                                    if (offsetsSearch !== '') {
                                      offsetsSearch += '_';
                                    }
                                    offsetsSearch += `${i}-${Object.values(offsets)[i]}`;
                                  }
                                }
                                this.setState({ offsetsSearch }, () => this.getMessages());
                              }}
                            >
                              OK
                            </button>
                          </div>
                        </div>
                      </div>
                    </Dropdown.Menu>
                  )}
                </Dropdown>
              </li>
            </ul>
          </div>
        </nav>
        <div className="table-responsive">
          <Table
            firstHeader={firstColumns}
            columns={[
              {
                id: 'key',
                accessor: 'key',
                colName: 'Key',
                type: 'text',
                cell: (obj, col) => {
                  return (
                    <div className="value cell-div">
                      <div className="align-cell">
                        <span>
                          <code className="key">{obj[col.accessor]}</code>
                        </span>
                      </div>
                    </div>
                  );
                }
              },
              {
                id: 'value',
                accessor: 'value',
                colName: 'Value',
                type: 'text',
                extraRow: true,
                extraRowContent: (obj, index) => {
                  return (
                    <AceEditor
                      mode="json"
                      id={'value' + index}
                      theme="dracula"
                      value={obj.value}
                      readOnly
                      name="UNIQUE_ID_OF_DIV"
                      editorProps={{ $blockScrolling: true }}
                      style={{ width: '100%', minHeight: '25vh' }}
                    />
                  );
                },
                cell: (obj, index) => {
                  return (
                    <pre class="mb-0 khq-data-highlight">
                      <code>{obj.value}</code>
                    </pre>
                  );
                }
              },
              {
                id: 'timestamp',
                accessor: 'timestamp',
                colName: 'Date',
                type: 'text',
                cell: (obj, col) => {
                  return (
                    <div className="value cell-div">
                      <div className="align-cell">{obj[col.accessor]}</div>
                    </div>
                  );
                }
              },
              {
                id: 'partition',
                accessor: 'partition',
                colName: 'Partition',
                type: 'text',
                cell: (obj, col) => {
                  return (
                    <div className="value cell-div">
                      <div className="align-cell">{obj[col.accessor]}</div>
                    </div>
                  );
                }
              },
              {
                id: 'offset',
                accessor: 'offset',
                colName: 'Offset',
                type: 'text',
                cell: (obj, col) => {
                  return (
                    <div className="value cell-div">
                      <div className="align-cell">{obj[col.accessor]}</div>
                    </div>
                  );
                }
              },
              {
                id: 'headers',
                accessor: 'headers',
                colName: 'Headers',
                type: 'text',
                expand: true,
                cell: obj => {
                  return <div className="tail-headers">{Object.keys(obj.headers).length}</div>;
                }
              },
              {
                id: 'schema',
                accessor: 'schema',
                colName: 'Schema',
                type: 'text',
                cell: (obj, col) => {
                  return (
                    <div className="value cell-div">
                      <div className="align-cell">
                        {obj[col.accessor] !== '' && (
                          <span
                            className="badge badge-primary clickable"
                            onClick={() => {
                              let schema = this.state.schemas.find(el => {
                                return el.id === obj.schema;
                              });
                              if (schema) {
                                this.props.history.push({
                                  pathname: `/ui/${clusterId}/schema/details/${schema.subject}`,
                                  schemaId: schema.subject
                                });
                              }
                            }}
                          >
                            Value: {obj[col.accessor]}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }
              }
            ]}
            extraRow
            noStripes
            data={messages}
            onDelete={row => {
              this.handleOnDelete(row);
            }}
            actions={canDeleteRecords ? [constants.TABLE_DELETE] : []}
            onExpand={obj => {
              return Object.keys(obj.headers).map(header => {
                return (
                  <tr
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      width: '100%'
                    }}
                  >
                    <td
                      style={{
                        width: '100%',
                        display: 'flex',
                        borderStyle: 'dashed',
                        borderWidth: '1px',
                        backgroundColor: '#171819'
                      }}
                    >
                      {header}
                    </td>
                    <td
                      style={{
                        width: '100%',
                        display: 'flex',
                        borderStyle: 'dashed',
                        borderWidth: '1px',
                        backgroundColor: '#171819'
                      }}
                    >
                      {obj.headers[header]}
                    </td>
                  </tr>
                );
              });
            }}
          />
        </div>
        <Modal show={showHeadersModal} handleClose={this.closeHeadersModal}>
          <div className="headers-modal">
            <button
              type="button"
              className="close pull-right"
              aria-label="Close"
              onClick={this.closeHeadersModal}
            >
              <span aria-hidden="true">&times;</span>
            </button>
            <Table
              firstHeader={[
                { colName: 'Key', colSpan: 1 },
                { colName: 'Value', colSpan: 1 }
              ]}
              columns={[
                {
                  id: 'headerKey',
                  accessor: 'key',
                  colName: 'Key',
                  type: 'text',
                  cell: (obj, col) => {
                    return <div className="align-cell">{obj[col.accessor]}</div>;
                  }
                },
                {
                  id: 'headerValue',
                  accessor: 'value',
                  colName: 'Value',
                  type: 'text',
                  cell: (obj, col) => {
                    return (
                      <div className="value">
                        <div className="align-cell value-text headers-detail-value">
                          {obj[col.accessor] ? obj[col.accessor].substring(0, 50) : 'N/A'}
                          {obj[col.accessor] && obj[col.accessor].length > 50 && '(...)'}{' '}
                        </div>
                        <div className="headers-detail-button">
                          <button
                            className="btn btn-secondary headers pull-right"
                            onClick={() => this.showValueModal(obj[col.accessor])}
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    );
                  }
                }
              ]}
              data={headersModalBody}
            />
          </div>
        </Modal>
        <ConfirmModal
          show={this.state.showDeleteModal}
          handleCancel={this.closeDeleteModal}
          handleConfirm={this.deleteCompactMessage}
          message={this.state.deleteMessage}
        />
        <CodeViewModal
          show={showValueModal}
          body={valueModalBody}
          handleClose={this.closeValueModal}
        />
      </React.Fragment>
    );
  }
}

export default TopicData;
