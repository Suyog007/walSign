import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useUserDocuments } from '../hooks/useUserDocuments';
import { formatAddress, getSignUrl } from '../utils/addressUtils';
import DocumentCard from '../components/DocumentCard';
import AddParticipantsModal from '../components/AddParticipantsModal';
import { DocumentSummary } from '../services/registryService';
import {
  User,
  FileText,
  CheckCircle,
  RefreshCw,
  Search,
  Filter,
  Loader,
  AlertCircle,
  FileX,
} from 'lucide-react';
import { Button } from '../components/ui/Button';

type TabType = 'created' | 'assigned';
type FilterType = 'all' | 'pending' | 'partial' | 'complete';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const currentAccount = useCurrentAccount();
  const { createdDocs, assignedDocs, isLoading, error, refresh } = useUserDocuments();

  const [activeTab, setActiveTab] = useState<TabType>('created');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterType>('all');
  const [selectedDocument, setSelectedDocument] = useState<DocumentSummary | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const handleViewDocument = (documentId: string) => {
    navigate(`/sign?documentId=${documentId}`);
  };

  const handleAddParticipants = (documentId: string) => {
    const doc = createdDocs.find((d) => d.documentId === documentId);
    if (doc) {
      setSelectedDocument(doc);
      setIsModalOpen(true);
    } else {
      console.error('Document not found in createdDocs!');
    }
  };

  const handleShareLink = (documentId: string) => {
    const link = getSignUrl(documentId, true);
    navigator.clipboard.writeText(link);
    alert('Link copied to clipboard!');
  };

  const handleModalSuccess = () => {
    handleRefresh();
  };

  // Filter and search logic
  const filterDocuments = (docs: DocumentSummary[]) => {
    return docs.filter((doc) => {
      // Search filter
      const matchesSearch =
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.description.toLowerCase().includes(searchQuery.toLowerCase());

      // Status filter
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'pending' && doc.status === 0) ||
        (filterStatus === 'partial' && doc.status === 1) ||
        (filterStatus === 'complete' && doc.status === 2);

      return matchesSearch && matchesStatus;
    });
  };

  const filteredCreatedDocs = filterDocuments(createdDocs);
  const filteredAssignedDocs = filterDocuments(assignedDocs);
  const currentDocs = activeTab === 'created' ? filteredCreatedDocs : filteredAssignedDocs;

  // Stats
  const totalCreated = createdDocs.length;
  const totalAssigned = assignedDocs.length;
  
  // Deduplicate documents by ID before counting completed
  // (in case same document appears in both created and assigned)
  const allUniqueDocuments = Array.from(
    new Map(
      [...createdDocs, ...assignedDocs].map(doc => [doc.documentId, doc])
    ).values()
  );
  
  // Calculate actual status based on unique signers (not blockchain status)
  const completedCount = allUniqueDocuments.filter((doc) => {
    const uniqueSigners = new Set(doc.authorizedSigners).size;
    const signatureCount = doc.signatures.length;
    return signatureCount >= uniqueSigners && uniqueSigners > 0;
  }).length;

  if (!currentAccount) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Wallet Not Connected</h2>
          <p className="text-gray-600 mb-6">
            Please connect your wallet to view your documents.
          </p>
          <Button onClick={() => navigate('/')} variant="primary">
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-700 to-purple-800 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">My Documents</h1>
                <p className="text-gray-600 font-mono text-sm">
                  {formatAddress(currentAccount.address)}
                </p>
              </div>
            </div>
            <Button
              onClick={handleRefresh}
              variant="outline"
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-purple-100 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-purple-700" />
                <div>
                  <p className="text-sm text-gray-600">Created</p>
                  <p className="text-2xl font-bold text-gray-900">{totalCreated}</p>
                </div>
              </div>
            </div>
            <div className="bg-purple-100 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-purple-700" />
                <div>
                  <p className="text-sm text-gray-600">To Sign</p>
                  <p className="text-2xl font-bold text-gray-900">{totalAssigned}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-gray-900">{completedCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('created')}
                className={`px-6 py-4 font-medium text-sm transition-colors ${
                  activeTab === 'created'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Created by Me ({createdDocs.length})
              </button>
              <button
                onClick={() => setActiveTab('assigned')}
                className={`px-6 py-4 font-medium text-sm transition-colors ${
                  activeTab === 'assigned'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Assigned to Me ({assignedDocs.length})
              </button>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filterStatus === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterStatus('pending')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filterStatus === 'pending'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => setFilterStatus('partial')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filterStatus === 'partial'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Partial
                </button>
                <button
                  onClick={() => setFilterStatus('complete')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filterStatus === 'complete'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Complete
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm p-12 flex flex-col items-center justify-center">
            <Loader className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-600">Loading documents...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow-sm p-12 flex flex-col items-center justify-center">
            <AlertCircle className="w-12 h-12 text-red-600 mb-4" />
            <p className="text-gray-900 font-medium mb-2">Error loading documents</p>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={handleRefresh} variant="primary">
              Try Again
            </Button>
          </div>
        ) : currentDocs.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 flex flex-col items-center justify-center">
            <FileX className="w-16 h-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
            <p className="text-gray-600 text-center mb-6">
              {searchQuery || filterStatus !== 'all'
                ? 'Try adjusting your search or filter.'
                : activeTab === 'created'
                ? 'Create your first document to get started.'
                : 'No documents have been assigned to you yet.'}
            </p>
            {activeTab === 'created' && !searchQuery && filterStatus === 'all' && (
              <Button onClick={() => navigate('/upload')} variant="primary">
                Create Document
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentDocs.map((doc) => (
              <DocumentCard
                key={doc.documentId}
                document={doc}
                isCreator={activeTab === 'created'}
                onViewDocument={handleViewDocument}
                onAddParticipants={handleAddParticipants}
                onShareLink={handleShareLink}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Participants Modal */}
      {selectedDocument && (
        <AddParticipantsModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedDocument(null);
          }}
          document={selectedDocument}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
};

export default ProfilePage;

